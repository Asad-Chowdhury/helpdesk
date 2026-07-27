import 'dotenv/config'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { databaseName, ensureTestDatabase, testDatabaseUrl } from './test-db'

// node:child_process rather than Bun.spawn: this file runs under Bun when invoked as
// `bun run db:setup`, but under Node when Playwright loads it as globalSetup.
const run = promisify(execFile)

// fileURLToPath, not URL.pathname — the latter stays percent-encoded, which breaks any
// checkout whose path contains spaces.
const SERVER_DIR = fileURLToPath(new URL('../../server', import.meta.url))

/**
 * Creates the test database if needed and brings it up to the current schema.
 *
 * Runnable on its own (`bun run db:setup`) and called by Playwright's global setup, so
 * a fresh clone or a CI runner needs no manual database work.
 *
 * Migrations are applied with `prisma migrate deploy` rather than `migrate dev`:
 * deploy only replays committed migrations, where dev would try to generate new ones
 * from schema drift and can prompt or reset the database.
 */
export async function setupTestDatabase(): Promise<void> {
  const url = testDatabaseUrl()
  const name = databaseName(url)

  const { created } = await ensureTestDatabase()
  console.log(`[e2e] test database "${name}" ${created ? 'created' : 'already present'}`)

  let out: string
  try {
    const result = await run('bunx', ['prisma', 'migrate', 'deploy'], {
      cwd: SERVER_DIR,
      env: { ...process.env, DATABASE_URL: url },
    })
    out = result.stdout
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    throw new Error(
      `prisma migrate deploy failed (exit ${e.code}):\n${e.stderr || e.stdout || String(err)}`,
    )
  }

  const applied = out.match(/(\d+) migrations? found/)?.[1] ?? '?'
  console.log(`[e2e] schema up to date (${applied} migrations in history)`)
}

// Allow running this file directly as well as importing it.
if (import.meta.main) {
  await setupTestDatabase()
}
