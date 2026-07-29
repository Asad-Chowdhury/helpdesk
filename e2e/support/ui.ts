import { expect, type Page } from '@playwright/test'
import type { Account } from './accounts'

/**
 * The password input, disambiguated from the reveal toggle beside it.
 *
 * Without `exact`, `getByLabel('Password')` also matches the toggle button, whose
 * aria-label is "Show password" / "Hide password", and Playwright's strict mode fails.
 */
export function passwordField(page: Page) {
  return page.getByLabel('Password', { exact: true })
}

/**
 * The navigation landmark.
 *
 * The home page also offers "Log in" in its hero, so assertions about navbar state have
 * to be scoped or they match two elements and fail strict mode.
 */
export function navbar(page: Page) {
  return page.getByRole('navigation')
}

/** Signs in through the form so the browser ends up holding a real session cookie. */
export async function signIn(page: Page, account: Pick<Account, 'email' | 'password'>) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await passwordField(page).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}
