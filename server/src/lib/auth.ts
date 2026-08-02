import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma'
import { authSecret, baseURL, clientOrigins, rateLimitingEnabled } from './env'
import { hasWorkspaceAccess } from './workspace-access'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL,
  secret: authSecret,
  trustedOrigins: clientOrigins,
  rateLimit: {
    // Production only — dev, staging and the E2E suite skip it. See
    // rateLimitingEnabled in ./env for why that check isn't `=== 'production'`.
    //
    // Built-in rules already cap /sign-in, /sign-up, /change-password and
    // /change-email at 3 requests per 10s — the window/max below cover other paths.
    // Storage is in-memory, so limits are per-instance until this moves to Redis.
    //
    // BEFORE DEPLOYING: buckets are keyed by client IP, which Better Auth reads from
    // `x-forwarded-for`. Since v1.6.21 a multi-hop forwarded chain is rejected unless
    // `advanced.ipAddress.trustedProxies` lists the proxy addresses — and with no IP
    // resolvable it falls back to ONE shared bucket per path, so a single attacker
    // could lock every user out of sign-in. Set trustedProxies (or ipAddressHeaders)
    // to match the real deploy topology once it exists — and since these limits now
    // run only in production, that misconfiguration would first surface there.
    enabled: rateLimitingEnabled,
    window: 10,
    max: 100,
  },
  emailAndPassword: {
    enabled: true,
    // No public registration. Better Auth's raw sign-up endpoint creates a User with
    // no workspace and no role, which the workspaceId-scoping layer can't place.
    // Accounts are created server-side instead: the Phase 2 signup flow (Workspace +
    // first Admin, in one transaction), Phase 3 invites, and the dev seed script.
    // This gates the public HTTP endpoint only — auth.$context.internalAdapter
    // createUser/linkAccount still work for those paths.
    disableSignUp: true,
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
  databaseHooks: {
    session: {
      create: {
        /**
         * **No active membership anywhere means no session.**
         *
         * Better Auth authenticates the *account* — it knows nothing about Membership or
         * `deactivatedAt`. Without this, a deactivated person still signed in successfully
         * and landed in the app with `memberships: []`: signed in, with access to nothing.
         *
         * Hooked at session *creation* rather than on the sign-in endpoint, so it covers
         * every path that mints a session — email sign-in today, and the magic link the
         * Client role is getting later — instead of only the one that exists now.
         *
         * This runs *after* the password has been verified, so only the genuine account
         * owner ever sees the message. That is why it names the real reason instead of
         * reusing the deliberately-vague "Invalid email or password": being told your
         * access was removed is useful, and it reveals nothing to someone who could not
         * authenticate in the first place.
         *
         * Signup is unaffected: it issues its session through `auth.api.signInEmail`, and
         * `createWorkspaceWithAdmin` has already committed the ADMIN membership by then.
         */
        before: async (session) => {
          if (await hasWorkspaceAccess(session.userId)) return

          throw new APIError('FORBIDDEN', {
            message:
              'Your access to this workspace has been removed. Contact an admin if you think this is a mistake.',
          })
        },
      },
    },
  },
})
