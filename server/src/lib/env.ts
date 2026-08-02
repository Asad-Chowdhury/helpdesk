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

/**
 * True only for an explicit development run. Everything else — including an unset
 * NODE_ENV — is treated as production.
 *
 * This direction matters: keying safety checks off `NODE_ENV === 'production'` means a
 * deploy that forgets the variable silently gets the relaxed behaviour. Failing closed
 * costs a local developer one clear error message; failing open ships a vulnerability.
 */
export const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev'

/** The E2E suite (`e2e/playwright.config.ts` sets this). */
export const isTest = process.env.NODE_ENV === 'test'

/** Pre-production deploys. */
export const isStaging = process.env.NODE_ENV === 'staging'

/**
 * Whether the rate limiters run. Production only — dev, staging and the E2E suite all
 * skip them, since every request there shares one address and the limits get in the
 * way rather than protecting anything.
 *
 * Written as "not one of the known non-production environments" rather than
 * `NODE_ENV === 'production'` on purpose. The literal form would silently disable rate
 * limiting on a deploy that forgot to set NODE_ENV — the same fail-open shape as the
 * auth-secret guard above. This way an unrecognised or missing value leaves protection
 * on, and only an explicit dev/staging/test marker turns it off.
 */
export const rateLimitingEnabled = !isDevelopment && !isStaging && !isTest

// Better Auth silently falls back to a built-in default when no secret is given, which
// would sign sessions with a publicly known key — anyone could forge a session cookie
// for any user. Refuse to start instead.
export const authSecret = process.env.BETTER_AUTH_SECRET

if (!authSecret) {
  if (!isDevelopment) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32\n' +
        '(If this is a local dev run, set NODE_ENV=development.)',
    )
  }
  console.warn(
    '[auth] BETTER_AUTH_SECRET is not set — falling back to Better Auth\'s default dev secret. ' +
      'Sessions will be invalidated once you set a real one.',
  )
}

// ─── Inbound email ───────────────────────────────────────────────────────────

/**
 * Domains whose mail becomes tickets, e.g. `tickets.example.com`.
 *
 * Comma-separated, like CLIENT_ORIGIN. **Empty means inbound email is switched off** —
 * the webhook route is not mounted at all, so an unconfigured deploy has no public
 * ingest endpoint rather than one that accepts and discards.
 */
export const mailDomains = (process.env.MAIL_DOMAIN ?? '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)

export const inboundEmailEnabled = mailDomains.length > 0

/**
 * HTTP Basic credentials for the inbound webhook.
 *
 * The provider does not sign Inbound Parse requests, so this shared secret is the only
 * thing standing between the internet and an endpoint that writes tickets. Credentials go
 * in the destination URL the provider is configured with.
 *
 * Basic auth rather than a secret path segment so the secret stays out of request lines,
 * access logs and anything that forwards a URL.
 */
export const inboundWebhookUser = process.env.INBOUND_WEBHOOK_USER ?? 'inbound'
export const inboundWebhookPassword = process.env.INBOUND_WEBHOOK_PASSWORD

const MIN_WEBHOOK_PASSWORD_LENGTH = 32

if (inboundEmailEnabled && !isDevelopment && !isTest) {
  if (!inboundWebhookPassword) {
    throw new Error(
      'MAIL_DOMAIN is set but INBOUND_WEBHOOK_PASSWORD is not. The inbound webhook is a ' +
        'public write endpoint and must not run unauthenticated.\n' +
        'Generate one with: openssl rand -base64 32',
    )
  }
  if (inboundWebhookPassword.length < MIN_WEBHOOK_PASSWORD_LENGTH) {
    throw new Error(
      `INBOUND_WEBHOOK_PASSWORD must be at least ${MIN_WEBHOOK_PASSWORD_LENGTH} characters.`,
    )
  }
}

/**
 * Hard cap on an inbound request body.
 *
 * Express has no global byte limit for a content type no parser claims, so without this
 * the endpoint would accept a body of any size. 35 MB sits just above SendGrid's ~30 MB
 * ceiling, so it only ever trips on abuse, never on a delivery we would then be asked to
 * retry forever.
 */
export const inboundMaxBytes = (() => {
  const raw = process.env.INBOUND_MAX_BYTES ?? '36700160'
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`INBOUND_MAX_BYTES must be a positive integer, got "${raw}"`)
  }
  return value
})()

/**
 * Whether a message must pass SPF/DKIM to be accepted.
 *
 * **On by default outside development, and it matters more than it looks.** "Known senders
 * only" matches on the From address, which is trivially forgeable over SMTP — without an
 * authentication check it is not a security control at all, it just tells an attacker
 * which address to forge.
 *
 * Off in local simulation, where there is no real MTA to produce a result.
 */
export const inboundRequireAuthResults =
  (process.env.INBOUND_REQUIRE_AUTH_RESULTS ?? (isDevelopment || isTest ? 'false' : 'true')) ===
  'true'
