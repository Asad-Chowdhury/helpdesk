import { expect, test } from '@playwright/test'
import { setMembershipRole, signUpViaApi, uniqueAccount } from '../support/accounts'
import { signIn } from '../support/ui'

test.describe('Authentication', () => {
  test.describe('Access control', () => {
    test('shows the Users link and page to an admin', async ({ page, request }) => {
      const admin = await signUpViaApi(request, uniqueAccount('admin'))
      await signIn(page, admin)

      await page.getByRole('link', { name: 'Users' }).click()

      await expect(page).toHaveURL('/users')
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    })

    test('hides the link and refuses direct navigation for a non-admin', async ({
      page,
      request,
    }) => {
      const staff = await signUpViaApi(request, uniqueAccount('staff'))
      await setMembershipRole(staff.email, 'STAFF')

      await signIn(page, staff)
      await expect(page.getByRole('link', { name: 'Users' })).toBeHidden()

      // Hiding the link is presentation; navigating directly must still be refused.
      await page.goto('/users')
      await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Users' })).toBeHidden()
    })

    test.describe('Per-role access to /users', () => {
      for (const role of ['MANAGER', 'STAFF', 'CLIENT'] as const) {
        test(`refuses ${role}`, async ({ page, request }) => {
          const account = await signUpViaApi(request, uniqueAccount(role.toLowerCase()))
          await setMembershipRole(account.email, role)

          await signIn(page, account)
          await page.goto('/users')

          await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible()
        })
      }
    })

    test('redirects a signed-out visitor to login', async ({ page }) => {
      await page.goto('/users')

      await expect(page).toHaveURL('/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    })

    test('re-reads the role from the server rather than trusting the client', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('demoted'))
      await signIn(page, account)
      await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()

      // Demote after the session exists: the next load must reflect it.
      await setMembershipRole(account.email, 'STAFF')
      await page.goto('/users')

      await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible()
    })
  })
})
