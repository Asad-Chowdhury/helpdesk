import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth'

type Session = typeof auth.$Infer.Session

declare global {
  namespace Express {
    interface Request {
      user?: Session['user']
      session?: Session['session']
    }
  }
}

/**
 * Rejects the request unless it carries a valid session cookie.
 * On success attaches `req.user` and `req.session` for downstream handlers.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })

  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  req.user = session.user
  req.session = session.session
  next()
}
