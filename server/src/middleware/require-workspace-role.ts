import type { NextFunction, Request, Response } from 'express'
import type { Role } from '../generated/prisma/enums'
import { prisma } from '../lib/prisma'

declare global {
  namespace Express {
    interface Request {
      membership?: { id: string; role: Role; workspaceId: string }
    }
  }
}

/**
 * The tenant boundary for every workspace-scoped route.
 *
 * Handlers downstream read `req.params.workspaceId` and query on it directly. That is
 * only safe because this middleware has already proved the caller holds one of `roles`
 * in *that* workspace — remove it and the id in the URL becomes attacker-controlled.
 *
 * Pair it with requireAuth (`requireAuth, requireWorkspaceRole('ADMIN')`) so a caller
 * with no session gets 401 rather than 403.
 *
 * Non-members and insufficient roles both get a flat 403, never 404: a 404 would tell
 * an authenticated caller which workspace ids exist. Deactivated memberships are
 * excluded here, so deactivation revokes access on the very next request even though
 * the session cookie stays valid.
 */
export function requireWorkspaceRole(...roles: Role[]) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const workspaceId = req.params.workspaceId

    if (!workspaceId) {
      res.status(400).json({ error: 'Workspace id is required' })
      return
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.id, workspaceId, deactivatedAt: null },
      select: { id: true, role: true, workspaceId: true },
    })

    if (!membership || !roles.includes(membership.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    req.membership = membership
    next()
  }
}
