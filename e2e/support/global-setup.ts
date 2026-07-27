import 'dotenv/config'
import { setupTestDatabase } from './setup-test-db'
import { resetDatabase } from './test-db'

/**
 * Runs once before the whole suite: provision the test database, then clear it so a
 * run never inherits rows from the previous one.
 *
 * Per-test isolation is the suite's own job — call `resetDatabase()` from a
 * `beforeEach` in tests that need a clean slate.
 */
export default async function globalSetup(): Promise<void> {
  await setupTestDatabase()
  await resetDatabase()
  console.log('[e2e] database reset — starting from empty tables')
}
