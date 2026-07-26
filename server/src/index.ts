import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { prisma } from './lib/prisma';
import { auth } from './lib/auth';
import { clientOrigins } from './lib/env';
import { requireAuth } from './middleware/require-auth';
import { signupRouter } from './routes/signup';

const app = express()
const port = process.env.PORT || 3000;

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

app.get('/api/db-health', async (_req, res) => {
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

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
