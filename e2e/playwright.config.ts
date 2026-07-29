import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'
import { testDatabaseUrl } from './support/test-db'
import { API_PORT, API_URL, WEB_PORT, WEB_URL } from './support/urls'

// Validates the *_test suffix at config load, so a misconfigured URL fails before any
// server starts rather than after something has already been truncated.
const DATABASE_URL = testDatabaseUrl()

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',

  // One shared test database means parallel workers would truncate each other's rows
  // mid-test. Revisit with a database per worker if the suite outgrows serial runs.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Both halves of the app, on ports deliberately offset from the dev ones (3000/5173)
  // so running the suite doesn't collide with a dev environment that's already up.
  webServer: [
    {
      command: 'bun run src/index.ts',
      cwd: '../server',
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        CLIENT_ORIGIN: WEB_URL,
        BETTER_AUTH_URL: API_URL,
        BETTER_AUTH_SECRET:
          process.env.E2E_BETTER_AUTH_SECRET ?? 'e2e-only-secret-do-not-use-in-production',
        TRUST_PROXY: '0',
        // Relaxes rate limiting for the suite — see isTest in server/src/lib/env.ts.
        // Better Auth also uses this to resolve a local client IP.
        NODE_ENV: 'test',
      },
    },
    {
      command: `bunx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { VITE_API_URL: API_URL },
    },
  ],
})
