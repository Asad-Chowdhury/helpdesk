import { expect, test } from '@playwright/test'
import { signUpViaApi, uniqueAccount } from '../support/accounts'
import { passwordField } from '../support/ui'

test.describe('Authentication', () => {
  test.describe('Signup page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/signup')
    })

    test('creates a workspace and lands the new admin signed in', async ({ page }) => {
      const account = uniqueAccount('owner')

      await page.getByLabel('Workspace name').fill(account.workspaceName)
      await page.getByLabel('Your name').fill(account.name)
      await page.getByLabel('Work email').fill(account.email)
      await passwordField(page).fill(account.password)
      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page).toHaveURL('/')
      await expect(page.getByText(account.email)).toBeVisible()
      // Signup provisions the first ADMIN, so the admin-only link is the visible proof.
      await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
    })

    test('reports every empty field at once without contacting the server', async ({ page }) => {
      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page.getByText('Workspace name is required')).toBeVisible()
      await expect(page.getByText('Your name is required')).toBeVisible()
      await expect(page.getByText('Enter a valid email address')).toBeVisible()
      // Signup's schema uses a minimum length, so an empty password reports that rather
      // than a separate "required" message.
      await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
      await expect(page).toHaveURL('/signup')
    })

    test('rejects a malformed email', async ({ page }) => {
      const account = uniqueAccount('bademail')

      await page.getByLabel('Workspace name').fill(account.workspaceName)
      await page.getByLabel('Your name').fill(account.name)
      await page.getByLabel('Work email').fill('not-an-email')
      await passwordField(page).fill(account.password)
      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page.getByText('Enter a valid email address')).toBeVisible()
      await expect(page).toHaveURL('/signup')
    })

    test('rejects a password under 8 characters', async ({ page }) => {
      const account = uniqueAccount('shortpw')

      await page.getByLabel('Workspace name').fill(account.workspaceName)
      await page.getByLabel('Your name').fill(account.name)
      await page.getByLabel('Work email').fill(account.email)
      await passwordField(page).fill('abc1234')

      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
      await expect(page).toHaveURL('/signup')
    })

    test('surfaces a duplicate email on the email field', async ({ page, request }) => {
      const existing = await signUpViaApi(request, uniqueAccount('taken'))

      await page.getByLabel('Workspace name').fill('Second Workspace')
      await page.getByLabel('Your name').fill('Someone Else')
      await page.getByLabel('Work email').fill(existing.email)
      await passwordField(page).fill(existing.password)
      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page.getByText('An account with that email already exists')).toBeVisible()
      await expect(page).toHaveURL('/signup')
    })

    test('clears a server error once the offending field is edited', async ({ page, request }) => {
      const existing = await signUpViaApi(request, uniqueAccount('retry'))
      const retry = uniqueAccount('retry2')

      await page.getByLabel('Workspace name').fill(retry.workspaceName)
      await page.getByLabel('Your name').fill(retry.name)
      await page.getByLabel('Work email').fill(existing.email)
      await passwordField(page).fill(retry.password)
      await page.getByRole('button', { name: 'Create workspace' }).click()
      await expect(page.getByText('An account with that email already exists')).toBeVisible()

      // Correcting the email and resubmitting must succeed rather than stay stuck.
      await page.getByLabel('Work email').fill(retry.email)
      await page.getByRole('button', { name: 'Create workspace' }).click()

      await expect(page).toHaveURL('/')
      await expect(page.getByText(retry.email)).toBeVisible()
    })

    test('masks the password until the reveal toggle is used', async ({ page }) => {
      const password = passwordField(page)
      await password.fill('secret-value')

      await expect(password).toHaveAttribute('type', 'password')
      await page.getByRole('button', { name: 'Show password' }).click()
      await expect(password).toHaveAttribute('type', 'text')
      await page.getByRole('button', { name: 'Hide password' }).click()
      await expect(password).toHaveAttribute('type', 'password')
    })

    test('links to the login page', async ({ page }) => {
      await page.getByRole('link', { name: 'Sign in' }).click()
      await expect(page).toHaveURL('/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    })
  })
})
