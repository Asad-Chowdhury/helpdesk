// Comma-separated list of allowed client origins (e.g. "http://localhost:5173,https://app.example.com").
// Shared by the CORS config and Better Auth's trustedOrigins so the two can't drift apart.
export const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

// Public URL of this API — Better Auth uses it to build callback/redirect URLs.
// Also decides cookie security: Better Auth marks session cookies `Secure` (and
// applies the `__Secure-` prefix) only when this starts with https://.
export const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

// Better Auth silently falls back to a built-in default when no secret is given,
// which would sign production sessions with a publicly known key. Fail loudly
// instead of shipping that.
export const authSecret = process.env.BETTER_AUTH_SECRET

if (!authSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32',
    )
  }
  console.warn(
    '[auth] BETTER_AUTH_SECRET is not set — falling back to Better Auth\'s default dev secret. ' +
      'Sessions will be invalidated once you set a real one.',
  )
}
