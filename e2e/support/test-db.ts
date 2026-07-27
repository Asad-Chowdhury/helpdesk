import { Client } from 'pg'

/**
 * Guard against pointing the suite at a real database.
 *
 * `resetDatabase()` truncates every table, so a mistyped TEST_DATABASE_URL would
 * silently destroy development or production data. Requiring the name to end in
 * `_test` makes that mistake impossible rather than merely unlikely.
 */
const REQUIRED_SUFFIX = '_test'

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set — copy e2e/.env.example to e2e/.env')
  }

  const name = databaseName(url)
  if (!name.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `Refusing to use database "${name}": TEST_DATABASE_URL must name a database ` +
        `ending in "${REQUIRED_SUFFIX}". The suite truncates every table, so this ` +
        `must never point at development or production data.`,
    )
  }

  return url
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? ''
}

/** Connection URL for the `postgres` maintenance database on the same server. */
export function adminUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = '/postgres'
  parsed.search = ''
  return parsed.toString()
}

/** Creates the test database when it doesn't exist yet. Safe to call repeatedly. */
export async function ensureTestDatabase(): Promise<{ created: boolean; name: string }> {
  const url = testDatabaseUrl()
  const name = databaseName(url)
  const admin = new Client({ connectionString: adminUrl(url) })

  await admin.connect()
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      name,
    ])
    if (rowCount) return { created: false, name }

    // CREATE DATABASE takes no bind parameters, so the identifier is quoted by hand.
    // `name` has already been constrained to the *_test suffix above.
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`)
    return { created: true, name }
  } finally {
    await admin.end()
  }
}

/**
 * Empties every application table, leaving the schema and migration history intact.
 *
 * Tables are discovered from the catalog rather than hard-coded, so this keeps working
 * as the schema grows — a list would silently miss new tables and leak state between
 * tests. One TRUNCATE ... CASCADE handles foreign keys without needing a delete order.
 */
export async function resetDatabase(): Promise<void> {
  const url = testDatabaseUrl()
  const client = new Client({ connectionString: url })

  await client.connect()
  try {
    const { rows } = await client.query<{ table: string }>(`
      SELECT quote_ident(tablename) AS table
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `)

    if (rows.length === 0) return

    await client.query(
      `TRUNCATE TABLE ${rows.map((r) => r.table).join(', ')} RESTART IDENTITY CASCADE`,
    )
  } finally {
    await client.end()
  }
}
