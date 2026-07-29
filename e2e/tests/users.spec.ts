import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { setMembershipRole, signUpViaApi, uniqueAccount, type Account } from '../support/accounts'
import { signIn } from '../support/ui'
import { API_HEADERS, API_URL } from '../support/urls'

/** The workspace id of whichever account currently holds the session in `ctx`. */
async function currentWorkspaceId(ctx: { get: APIRequestContext['get'] }): Promise<string> {
  const response = await ctx.get(`${API_URL}/api/me`)
  const body = await response.json()
  return body.memberships[0].workspace.id
}

/** Adds a member straight through the API — used to set up rows a test isn't about creating. */
async function addMemberViaApi(
  ctx: { post: APIRequestContext['post'] },
  workspaceId: string,
  member: Pick<Account, 'name' | 'email'> & { role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'CLIENT' },
): Promise<{ member: { id: string }; temporaryPassword?: string }> {
  const response = await ctx.post(`${API_URL}/api/workspaces/${workspaceId}/users`, {
    data: member,
    headers: API_HEADERS,
  })
  if (!response.ok()) {
    throw new Error(`addMemberViaApi failed (${response.status()}): ${await response.text()}`)
  }
  return response.json()
}

async function openUsersPage(page: Page) {
  await page.goto('/users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
}

test.describe('User management', () => {
  test.describe('Users page', () => {
    test('lists the signed-in admin as the sole active admin', async ({ page, request }) => {
      const admin = await signUpViaApi(request, uniqueAccount('admin'))
      await signIn(page, admin)
      await openUsersPage(page)

      const row = page.getByRole('row', { name: admin.email })
      await expect(row).toContainText(admin.name)
      await expect(row).toContainText('You')
      await expect(row).toContainText('Active')

      // The only active admin can't demote or deactivate themselves out of the workspace.
      await expect(row.getByRole('combobox', { name: `Role for ${admin.name}` })).toBeDisabled()
      await expect(row.getByRole('button', { name: 'Deactivate' })).toBeDisabled()
    })

    test('adds a member and the new row appears', async ({ page, request }) => {
      const admin = await signUpViaApi(request, uniqueAccount('admin'))
      await signIn(page, admin)
      await openUsersPage(page)

      const newMember = uniqueAccount('newmember')
      await page.getByRole('button', { name: 'Add member', exact: true }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Name').fill(newMember.name)
      await dialog.getByLabel('Email').fill(newMember.email)
      // Role defaults to Staff — this test isn't about the role picker.
      await dialog.getByRole('button', { name: 'Add member' }).click()

      // A brand-new email gets a real, one-time-shown temporary password.
      await expect(dialog.getByText('Member added')).toBeVisible()
      const temporaryPassword = await dialog.getByTestId('temporary-password').innerText()
      expect(temporaryPassword.length).toBeGreaterThan(0)

      await dialog.getByRole('button', { name: 'Done' }).click()
      await expect(dialog).toBeHidden()

      const row = page.getByRole('row', { name: newMember.email })
      await expect(row).toContainText(newMember.name)
      await expect(row).toContainText('Staff')
      await expect(row).toContainText('Active')
    })

    test("changes a member's role and it sticks across a reload", async ({ page, request }) => {
      const admin = await signUpViaApi(request, uniqueAccount('admin'))
      await signIn(page, admin)

      const workspaceId = await currentWorkspaceId(page.request)
      const member = uniqueAccount('promoted')
      await addMemberViaApi(page.request, workspaceId, { ...member, role: 'STAFF' })

      await openUsersPage(page)
      const row = page.getByRole('row', { name: member.email })
      await row.getByRole('combobox', { name: `Role for ${member.name}` }).click()
      await page.getByRole('option', { name: 'Manager' }).click()

      await expect(row.getByRole('combobox', { name: `Role for ${member.name}` })).toContainText(
        'Manager',
      )

      await page.reload()

      const reloadedRow = page.getByRole('row', { name: member.email })
      await expect(
        reloadedRow.getByRole('combobox', { name: `Role for ${member.name}` }),
      ).toContainText('Manager')
    })

    test("deactivates a member and their status shows as deactivated", async ({
      page,
      request,
    }) => {
      const admin = await signUpViaApi(request, uniqueAccount('admin'))
      await signIn(page, admin)

      const workspaceId = await currentWorkspaceId(page.request)
      const member = uniqueAccount('todeactivate')
      await addMemberViaApi(page.request, workspaceId, { ...member, role: 'STAFF' })

      await openUsersPage(page)
      const row = page.getByRole('row', { name: member.email })
      await expect(row).toContainText('Active')

      await row.getByRole('button', { name: 'Deactivate' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Deactivate' })
        .click()

      await expect(row).toContainText('Deactivated')
      await expect(row.getByRole('button', { name: 'Reactivate' })).toBeVisible()
    })

    test('cuts off a deactivated admin who could previously reach /users', async ({
      page,
      request,
      browser,
    }) => {
      const owner = await signUpViaApi(request, uniqueAccount('owner'))
      await signIn(page, owner)

      const workspaceId = await currentWorkspaceId(page.request)
      const demoted = uniqueAccount('demotedadmin')
      const { temporaryPassword } = await addMemberViaApi(page.request, workspaceId, {
        ...demoted,
        role: 'ADMIN',
      })
      if (!temporaryPassword) throw new Error('Expected a temporary password for a brand-new user')

      // The second admin, in their own browser session, can reach /users.
      const secondContext = await browser.newContext()
      const secondPage = await secondContext.newPage()
      await signIn(secondPage, { email: demoted.email, password: temporaryPassword })
      await openUsersPage(secondPage)

      // The owner deactivates them.
      await openUsersPage(page)
      const row = page.getByRole('row', { name: demoted.email })
      await row.getByRole('button', { name: 'Deactivate' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Deactivate' })
        .click()
      await expect(row).toContainText('Deactivated')

      // Their cookie is still valid, but GET /api/me now filters the deactivated
      // membership out, so the route guard has nothing to grant access with.
      await secondPage.goto('/users')
      await expect(secondPage.getByRole('heading', { name: 'Not available' })).toBeVisible()
      await expect(secondPage.getByRole('heading', { name: 'Users' })).toBeHidden()

      await secondContext.close()
    })
  })

  test.describe('GET /api/workspaces/:workspaceId/users', () => {
    test('returns 401 when there is no session', async ({ request }) => {
      const response = await request.get(`${API_URL}/api/workspaces/any-workspace-id/users`)
      expect(response.status()).toBe(401)
    })

    test('returns 403 for a member who is not an admin', async ({ request }) => {
      const account = await signUpViaApi(request, uniqueAccount('nonadmin'))
      const workspaceId = await currentWorkspaceId(request)
      await setMembershipRole(account.email, 'STAFF')

      const response = await request.get(`${API_URL}/api/workspaces/${workspaceId}/users`)
      expect(response.status()).toBe(403)
    })

    test("returns 403 for an admin requesting another workspace's users", async ({
      page,
      request,
    }) => {
      await signUpViaApi(request, uniqueAccount('tenantA'))
      const workspaceIdA = await currentWorkspaceId(request)

      const ownerB = await signUpViaApi(request, uniqueAccount('tenantB'))
      // ownerB is a genuine admin — just not of workspace A.
      await signIn(page, ownerB)

      const response = await page.request.get(`${API_URL}/api/workspaces/${workspaceIdA}/users`)
      expect(response.status()).toBe(403)
    })
  })
})
