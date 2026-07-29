import type { APIRequestContext } from '@playwright/test'
import { Client } from 'pg'
import { testDatabaseUrl } from './test-db'
import { API_HEADERS, API_URL } from './urls'

export const VALID_PASSWORD = 'password1234'

/**
 * Unique identity per call.
 *
 * The suite resets the database once per run, not per test, so tests must not collide
 * on the unique email/slug constraints. Unique data is also what keeps every test
 * independently runnable and order-independent.
 */
export function uniqueAccount(prefix = 'user') {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return {
    email: `${prefix}-${id}@example.test`,
    password: VALID_PASSWORD,
    name: `Test ${prefix}`,
    workspaceName: `WS ${prefix} ${id}`,
  }
}

export type Account = ReturnType<typeof uniqueAccount>

/**
 * Registers an account through the real endpoint, bypassing the UI.
 *
 * Signing up through the form in every test would make thirty slow, redundant
 * regression tests for the signup form. Tests that are *about* the form drive the UI;
 * everything else uses this.
 */
export async function signUpViaApi(
  request: APIRequestContext,
  account: Account = uniqueAccount(),
): Promise<Account> {
  // Absolute URL: baseURL is the web app, and a relative path would silently hit Vite.
  const response = await request.post(`${API_URL}/api/signup`, {
    data: account,
    headers: API_HEADERS,
  })

  if (!response.ok()) {
    throw new Error(`signUpViaApi failed (${response.status()}): ${await response.text()}`)
  }

  return account
}

/**
 * Demotes a user's membership.
 *
 * There is no invite flow yet, so a non-admin can only be produced by signing up (which
 * always creates an ADMIN) and changing the role directly. Replace this with the real
 * invite flow once Phase 3 lands.
 */
export async function setMembershipRole(
  email: string,
  role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'CLIENT',
): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() })
  await client.connect()
  try {
    const { rowCount } = await client.query(
      `UPDATE membership SET role = $1::"Role"
       WHERE "userId" = (SELECT id FROM "user" WHERE email = $2)`,
      [role, email.toLowerCase()],
    )
    if (!rowCount) throw new Error(`No membership found for ${email}`)
  } finally {
    await client.end()
  }
}
