import { Router } from 'express'
import { Role } from '../generated/prisma/enums'
import { requireAuth } from '../middleware/require-auth'
import { requireWorkspaceRole } from '../middleware/require-workspace-role'
import {
  addMember,
  AlreadyMemberError,
  LastAdminError,
  listMembers,
  MemberNotFoundError,
  SelfDeactivationError,
  setMemberActive,
  updateMemberRole,
} from '../services/members'
import { EmailTakenError } from '../services/workspace'

export const workspaceMembersRouter = Router()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = Object.values(Role) as Role[]

type FieldErrors = Record<string, string>

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

function validateAdd(body: unknown): {
  values: { name: string; email: string; role: Role }
  errors: FieldErrors
} {
  const errors: FieldErrors = {}
  const b = (body ?? {}) as Record<string, unknown>
  const read = (key: string) => (typeof b[key] === 'string' ? (b[key] as string).trim() : '')

  const name = read('name')
  const email = read('email')

  if (!name) errors.name = 'Name is required'
  else if (name.length > 100) errors.name = 'Name is too long'

  if (!email) errors.email = 'Email is required'
  else if (email.length > 254) errors.email = 'Email is too long'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address'

  if (!b.role) errors.role = 'Role is required'
  else if (!isRole(b.role)) errors.role = 'Choose a valid role'

  return { values: { name, email, role: b.role as Role }, errors }
}

/**
 * Every route here is scoped to :workspaceId and gated on the caller holding ADMIN in
 * *that* workspace. requireAuth runs first so a missing session is 401, not 403.
 *
 * Full paths are registered on the router and index.ts mounts it bare, matching
 * signup.ts. No rate limiter: these are authenticated admin routes, not a public
 * abuse surface.
 */
const adminOnly = [requireAuth, requireWorkspaceRole('ADMIN')] as const

workspaceMembersRouter.get(
  '/api/workspaces/:workspaceId/users',
  ...adminOnly,
  async (req, res) => {
    const members = await listMembers(req.params.workspaceId!)
    res.json({ members })
  },
)

workspaceMembersRouter.post(
  '/api/workspaces/:workspaceId/users',
  ...adminOnly,
  async (req, res) => {
    const { values, errors } = validateAdd(req.body)

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed', fields: errors })
      return
    }

    try {
      const { member, temporaryPassword } = await addMember({
        workspaceId: req.params.workspaceId!,
        name: values.name,
        email: values.email,
        role: values.role,
      })
      res.status(201).json({ member, temporaryPassword })
    } catch (err) {
      if (err instanceof AlreadyMemberError) {
        res.status(409).json({ error: err.message, fields: { email: err.message } })
        return
      }
      if (err instanceof EmailTakenError) {
        res.status(409).json({ error: err.message, fields: { email: err.message } })
        return
      }
      console.error('Add member failed:', err)
      res.status(500).json({ error: 'Could not add this member' })
    }
  },
)

workspaceMembersRouter.patch(
  '/api/workspaces/:workspaceId/users/:membershipId',
  ...adminOnly,
  async (req, res) => {
    const workspaceId = req.params.workspaceId!
    const membershipId = req.params.membershipId!
    const b = (req.body ?? {}) as Record<string, unknown>

    const wantsRole = b.role !== undefined
    const wantsActive = b.active !== undefined

    if (!wantsRole && !wantsActive) {
      res.status(400).json({ error: 'Nothing to update' })
      return
    }
    if (wantsRole && !isRole(b.role)) {
      res.status(400).json({ error: 'Validation failed', fields: { role: 'Choose a valid role' } })
      return
    }
    if (wantsActive && typeof b.active !== 'boolean') {
      res
        .status(400)
        .json({ error: 'Validation failed', fields: { active: 'Active must be true or false' } })
      return
    }

    try {
      // Applied in sequence rather than as one write: each carries its own guard, and
      // a request that changes both should fail on the stricter of the two.
      let member
      if (wantsRole) {
        member = await updateMemberRole({ workspaceId, membershipId, role: b.role as Role })
      }
      if (wantsActive) {
        member = await setMemberActive({
          workspaceId,
          membershipId,
          active: b.active as boolean,
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
