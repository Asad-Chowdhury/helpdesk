import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { prisma } from './lib/prisma';
import { auth } from './lib/auth';
import { clientOrigins, trustProxy } from './lib/env';
import { requireAuth } from './middleware/require-auth';
import { signupRouter } from './routes/signup';
import { workspaceMembersRouter } from './routes/workspace-members';

const app = express()
const port = process.env.PORT || 3000;

// Must match the number of proxies actually in front of this app, or rate limiting
// keys on the wrong address. See TRUST_PROXY in lib/env.ts.
app.set('trust proxy', trustProxy)

app.use(
  cors({
    origin: clientOrigins,
    credentials: true, // allow cookies (session-based auth) to be sent cross-origin
  }),
)

// Better Auth reads the raw request stream, so this must be mounted BEFORE
// express.json() — otherwise sign-up/sign-in POSTs hang forever.
// The bare `*` wildcard is Express 4 syntax; Express 5 would need `/api/auth/*splat`.
app.all('/api/auth/*', toNodeHandler(auth))

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Authenticated: database reachability is a useful recon signal, and /api/health
// already covers unauthenticated liveness checks for a load balancer.
app.get('/api/db-health', requireAuth, async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ database: 'connected' })
  } catch (err) {
    console.error('DB health check failed:', err)
    res.status(503).json({ database: 'unreachable' })
  }
})

// Needs express.json(), so it is mounted after it — unlike the Better Auth handler.
app.use(signupRouter)
app.use(workspaceMembersRouter)

// Memberships carry the role, so this is what the client gates admin-only UI on.
// The role is read from the database per request — never from anything client-supplied.
//
// Deactivated memberships are omitted, which is what makes deactivation take effect:
// the member's session cookie stays valid (sessions are not workspace-scoped), but the
// workspace disappears from their /api/me and the admin UI gated on it goes with it.
app.get('/api/me', requireAuth, async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.user!.id, deactivatedAt: null },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  res.json({ user: req.user, memberships })
})

/**
 * Must be registered last, and must take four arguments for Express to treat it as an
 * error handler.
 *
 * Express's built-in handler renders the full stack trace into the response whenever
 * NODE_ENV isn't exactly 'production', which would hand file paths and connection
 * details to any unauthenticated caller on a bad deploy. This never sends details
 * regardless of environment — they go to the server log instead.
 *
 * Client errors raised upstream (body-parser's 400 on malformed JSON, for instance)
 * keep their status, since those describe the caller's request rather than our internals.
 */
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled request error:', err)

  // Express must finish a response it already started writing.
  if (res.headersSent) {
    next(err)
    return
  }

  const status = (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode
  const isClientError = typeof status === 'number' && status >= 400 && status < 500

  res
    .status(isClientError ? status : 500)
    .json({ error: isClientError ? 'Bad request' : 'Internal server error' })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
