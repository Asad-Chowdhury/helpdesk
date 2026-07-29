import { expect, test } from '@playwright/test'
import { signUpViaApi, uniqueAccount } from '../support/accounts'
import { navbar, signIn } from '../support/ui'
import { API_URL, WEB_URL } from '../support/urls'

test.describe('Authentication', () => {
  test.describe('Session lifecycle', () => {
    test('survives a full page reload', async ({ page, request }) => {
      const account = await signUpViaApi(request, uniqueAccount('persist'))
      await signIn(page, account)

      await page.reload()

      await expect(page.getByText(account.email)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    })

    test('clears the session and restores the logged-out navbar on sign out', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('signout'))
      await signIn(page, account)

      await page.getByRole('button', { name: 'Sign out' }).click()

      await expect(navbar(page).getByRole('link', { name: 'Log in' })).toBeVisible()
      await expect(navbar(page).getByRole('link', { name: 'Sign up' })).toBeVisible()
      await expect(page.getByText(account.email)).toBeHidden()
    })

    test('blocks a protected page once the user has signed out', async ({ page, request }) => {
      const account = await signUpViaApi(request, uniqueAccount('afterout'))
      await signIn(page, account)
      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(navbar(page).getByRole('link', { name: 'Log in' })).toBeVisible()

      await page.goto('/users')

      await expect(page).toHaveURL('/login')
    })

    test('invalidates the cookie immediately once the session is deleted server-side', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('revoke'))
      await signIn(page, account)

      // Sessions live in the database rather than a signed cookie, so revoking one has to
      // take effect on the very next request.
      const signedOut = await page.request.post(`${API_URL}/api/auth/sign-out`, {
        headers: { Origin: WEB_URL },
      })
      expect(signedOut.ok()).toBeTruthy()

      await page.goto('/users')
      await expect(page).toHaveURL('/login')
    })
  })

  test.describe('GET /api/me', () => {
    test('returns 401 when there is no session', async ({ request }) => {
      const response = await request.get(`${API_URL}/api/me`)
      expect(response.status()).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    })

    test('returns the user with an ADMIN membership after signup', async ({ request }) => {
      const account = await signUpViaApi(request, uniqueAccount('me'))

      const response = await request.get(`${API_URL}/api/me`)
      expect(response.ok()).toBeTruthy()

      const body = await response.json()
      expect(body.user.email).toBe(account.email.toLowerCase())
      expect(body.memberships).toHaveLength(1)
      expect(body.memberships[0].role).toBe('ADMIN')
      expect(body.memberships[0].workspace.name).toBe(account.workspaceName)
    })
  })
})
