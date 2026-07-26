import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma'
import { authSecret, baseURL, clientOrigins } from './env'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL,
  secret: authSecret,
  trustedOrigins: clientOrigins,
  rateLimit: {
    // Better Auth enables this in production only; turning it on everywhere means
    // the throttle is exercised in dev instead of running for the first time in prod.
    // Built-in rules already cap /sign-in, /sign-up, /change-password and
    // /change-email at 3 requests per 10s — the window/max below cover other paths.
    // Storage is in-memory, so limits are per-instance until this moves to Redis.
    //
    // BEFORE DEPLOYING: buckets are keyed by client IP, which Better Auth reads from
    // `x-forwarded-for`. Since v1.6.21 a multi-hop forwarded chain is rejected unless
    // `advanced.ipAddress.trustedProxies` lists the proxy addresses — and with no IP
    // resolvable it falls back to ONE shared bucket per path, so a single attacker
    // could lock every user out of sign-in. Set trustedProxies (or ipAddressHeaders)
    // to match the real deploy topology once it exists.
    enabled: true,
    window: 10,
    max: 100,
  },
  emailAndPassword: {
    enabled: true,
    // No email transport wired up yet (SendGrid lands in a later phase), so sign-up
    // must not gate on a verification link nobody can receive.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // extend the expiry at most once per day
    // cookieCache is intentionally left disabled (the default): every request
    // validates against the `session` row rather than trusting a signed cookie
    // payload. That is what makes these database sessions.
  },
})
