// Comma-separated list of allowed client origins (e.g. "http://localhost:5173,https://app.example.com").
// Shared by the CORS config and Better Auth's trustedOrigins so the two can't drift apart.
export const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())

/**
 * Number of reverse proxies in front of this app, passed to Express `trust proxy`.
 *
 * Rate limiting keys on req.ip. Left at 0 behind a proxy, every request carries the
 * proxy's address and all clients share one bucket — which throttles legitimate
 * signups instead of abusers. Set too high, clients can spoof X-Forwarded-For and
 * evade the limit entirely. It must match the real deploy topology (Railway is
 * typically 1); 0 is correct only when clients connect directly, as in local dev.
 */
export const trustProxy = (() => {
  const raw = process.env.TRUST_PROXY ?? '0'
  const hops = Number(raw)
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`TRUST_PROXY must be a non-negative integer, got "${raw}"`)
  }
  return hops
})()

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
