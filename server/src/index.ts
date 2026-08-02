import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { prisma } from './lib/prisma';
import { auth } from './lib/auth';
import { clientOrigins, trustProxy } from './lib/env';
import { requireAuth } from './middleware/require-auth';
import { signupRouter } from './routes/signup';
import { usersRouter } from './modules/users/users.routes';
import { ticketsRouter } from './modules/tickets/tickets.routes';
import { inboundEmailRouter } from './modules/email/inbound.routes';
import { inboundEmailEnabled } from './lib/env';

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

// Mounted BEFORE express.json() for the same reason the Better Auth handler is: it reads
// the raw request stream itself (multipart, via busboy). body-parser checks Content-Type
// before touching the stream so it would not consume a multipart body today — this is
// insurance against that ever changing.
//
// Only mounted when MAIL_DOMAIN is configured: an unconfigured deploy then has no public
// ingest endpoint at all, rather than one that accepts requests and discards them.
if (inboundEmailEnabled) app.use(inboundEmailRouter)

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

// These all need express.json(), so they mount after it — unlike the Better Auth handler.
// usersRouter owns /api/me and the workspace membership routes; ticketsRouter owns the
// workspace ticket routes.
app.use(signupRouter)
app.use(usersRouter)
app.use(ticketsRouter)

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
