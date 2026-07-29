import { expect, test } from '@playwright/test'
import { signUpViaApi, uniqueAccount, VALID_PASSWORD } from '../support/accounts'
import { passwordField } from '../support/ui'

test.describe('Authentication', () => {
  test.describe('Login page', () => {
    test('signs in an existing account and returns it to the home page', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('login'))

      await page.goto('/login')
      await page.getByLabel('Email').fill(account.email)
      await passwordField(page).fill(account.password)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL('/')
      await expect(page.getByText(account.email)).toBeVisible()
    })

    test('rejects a wrong password without revealing that the account exists', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('wrongpw'))

      await page.goto('/login')
      await page.getByLabel('Email').fill(account.email)
      await passwordField(page).fill('definitely-not-the-password')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page.getByRole('alert')).toContainText('Invalid email or password')
      await expect(page).toHaveURL('/login')
    })

    test('gives an unknown email the identical message to a wrong password', async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.test`)
      await passwordField(page).fill(VALID_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()

      // Differing copy here would let an attacker enumerate registered addresses.
      await expect(page.getByRole('alert')).toContainText('Invalid email or password')
      await expect(page).toHaveURL('/login')
    })

    test('requires both fields before submitting', async ({ page }) => {
      await page.goto('/login')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page.getByText('Enter a valid email address')).toBeVisible()
      await expect(page.getByText('Password is required')).toBeVisible()
      await expect(page).toHaveURL('/login')
    })

    test('treats the email as case-insensitive', async ({ page, request }) => {
      const account = uniqueAccount('case')
      const upper = account.email.toUpperCase()
      await signUpViaApi(request, { ...account, email: upper })

      await page.goto('/login')
      await page.getByLabel('Email').fill(account.email.toLowerCase())
      await passwordField(page).fill(account.password)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL('/')
    })

    test('recovers after a failed attempt without a reload', async ({ page, request }) => {
      const account = await signUpViaApi(request, uniqueAccount('recover'))

      await page.goto('/login')
      await page.getByLabel('Email').fill(account.email)
      await passwordField(page).fill('wrong-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert')).toContainText('Invalid email or password')

      await passwordField(page).fill(account.password)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL('/')
      await expect(page.getByText(account.email)).toBeVisible()
    })

    test('links to the signup page', async ({ page }) => {
      await page.goto('/login')
      await page.getByRole('link', { name: 'Create one' }).click()

      await expect(page).toHaveURL('/signup')
      await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
    })
  })
})
