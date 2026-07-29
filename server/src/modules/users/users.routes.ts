import { Router } from 'express'
import { requireAuth } from '../../middleware/require-auth'
import { requireWorkspaceRole } from '../../middleware/require-workspace-role'
import { parseBody, validationErrorBody } from '../../lib/validation'
import { EmailTakenError } from '../../services/workspace'
import { addMemberSchema, updateMemberSchema, updateProfileSchema } from './users.schemas'
import {
  addMember,
  AlreadyMemberError,
  deleteMember,
  LastAdminError,
  listMembers,
  listMyMemberships,
  MemberNotFoundError,
  SelfDeactivationError,
  SelfDeletionError,
  setMemberActive,
  updateMemberRole,
  updateProfile,
  UserNotFoundError,
} from './users.service'

/**
 * Every user-facing endpoint: the caller's own identity, and workspace membership CRUD.
 *
 * Full paths are registered on the router and index.ts mounts it bare, matching
 * signup.ts. Tenant provisioning (POST /api/signup) deliberately stays out — it creates
 * a workspace and its first admin together, and carries its own rate limiter.
 */
export const usersRouter = Router()

/**
 * Memberships carry the role, so this is what the client gates admin-only UI on.
 * The role is read from the database per request — never from anything client-supplied.
 */
usersRouter.get('/api/me', requireAuth, async (req, res) => {
  const memberships = await listMyMemberships(req.user!.id)
  res.json({ user: req.user, memberships })
})

/**
 * Self-service profile edit — name and email only.
 *
 * The target is `req.user.id` from the session, never anything in the body, so there is
 * no id here for a caller to swap. Password changes go to Better Auth's
 * /api/auth/change-password, which checks the current password first; roles are an
 * admin's call and live on the workspace routes below.
 */
usersRouter.patch('/api/me', requireAuth, async (req, res) => {
  const parsed = parseBody(updateProfileSchema, req.body)

  if (!parsed.success) {
    res.status(400).json(validationErrorBody(parsed.error))
    return
  }

  try {
    const user = await updateProfile({ userId: req.user!.id, ...parsed.data })
    const memberships = await listMyMemberships(user.id)
    res.json({ user, memberships })
  } catch (err) {
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: err.message, fields: { email: err.message } })
      return
    }
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: err.message })
      return
    }
    console.error('Profile update failed:', err)
    res.status(500).json({ error: 'Could not save your profile' })
  }
})

/**
 * The workspace-scoped routes below are gated on the caller holding ADMIN in *that*
 * workspace. requireAuth runs first so a missing session is 401, not 403.
 *
 * No rate limiter: these are authenticated admin routes, not a public abuse surface.
 */
const adminOnly = [requireAuth, requireWorkspaceRole('ADMIN')] as const

usersRouter.get('/api/workspaces/:workspaceId/users', ...adminOnly, async (req, res) => {
  const members = await listMembers(req.params.workspaceId!)
  res.json({ members })
})

usersRouter.post('/api/workspaces/:workspaceId/users', ...adminOnly, async (req, res) => {
  const parsed = parseBody(addMemberSchema, req.body)

  if (!parsed.success) {
    res.status(400).json(validationErrorBody(parsed.error))
    return
  }

  try {
    const { member, temporaryPassword } = await addMember({
      workspaceId: req.params.workspaceId!,
      ...parsed.data,
    })
    res.status(201).json({ member, temporaryPassword })
  } catch (err) {
    if (err instanceof AlreadyMemberError || err instanceof EmailTakenError) {
      res.status(409).json({ error: err.message, fields: { email: err.message } })
      return
    }
    console.error('Add member failed:', err)
    res.status(500).json({ error: 'Could not add this member' })
  }
})

usersRouter.patch(
  '/api/workspaces/:workspaceId/users/:membershipId',
  ...adminOnly,
  async (req, res) => {
    const parsed = parseBody(updateMemberSchema, req.body)

    if (!parsed.success) {
      res.status(400).json(validationErrorBody(parsed.error))
      return
    }

    const workspaceId = req.params.workspaceId!
    const membershipId = req.params.membershipId!
    const { role, active } = parsed.data

    try {
      // Applied in sequence rather than as one write: each carries its own guard, and
      // a request that changes both should fail on the stricter of the two.
      let member
      if (role !== undefined) {
        member = await updateMemberRole({ workspaceId, membershipId, role })
      }
      if (active !== undefined) {
        member = await setMemberActive({
          workspaceId,
          membershipId,
          active,
          actorUserId: req.user!.id,
        })
      }
      res.json({ member })
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      if (err instanceof LastAdminError || err instanceof SelfDeactivationError) {
        res.status(409).json({ error: err.message })
        return
      }
      console.error('Update member failed:', err)
      res.status(500).json({ error: 'Could not update this member' })
    }
  },
)

/**
 * Irreversible, unlike deactivation. Wipes the account outright when this workspace was
 * the person's only one; otherwise removes just this membership, so one tenant's admin
 * cannot destroy an account another tenant relies on. See deleteMember for the reasoning.
 */
usersRouter.delete(
  '/api/workspaces/:workspaceId/users/:membershipId',
  ...adminOnly,
  async (req, res) => {
    try {
      const result = await deleteMember({
        workspaceId: req.params.workspaceId!,
        membershipId: req.params.membershipId!,
        actorUserId: req.user!.id,
      })
      res.json(result)
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      if (err instanceof LastAdminError || err instanceof SelfDeletionError) {
        res.status(409).json({ error: err.message })
        return
      }
      console.error('Delete member failed:', err)
      res.status(500).json({ error: 'Could not delete this member' })
    }
  },
)
