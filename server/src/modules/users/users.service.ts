import type { Role } from '../../generated/prisma/enums'
import { auth } from '../../lib/auth'
import { prisma } from '../../lib/prisma'
import { EmailTakenError, newId, uniqueViolationOn } from '../../services/workspace'

export class AlreadyMemberError extends Error {
  constructor() {
    super('That person is already a member of this workspace')
    this.name = 'AlreadyMemberError'
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('Member not found')
    this.name = 'MemberNotFoundError'
  }
}

export class LastAdminError extends Error {
  constructor() {
    super('This workspace must keep at least one active admin')
    this.name = 'LastAdminError'
  }
}

export class SelfDeactivationError extends Error {
  constructor() {
    super('You cannot deactivate your own account')
    this.name = 'SelfDeactivationError'
  }
}

export class SelfDeletionError extends Error {
  constructor() {
    super('You cannot delete your own account')
    this.name = 'SelfDeletionError'
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('Account not found')
    this.name = 'UserNotFoundError'
  }
}

/**
 * The only shape a member is ever exposed in. Selecting explicitly rather than
 * `include: { user: true }` keeps emailVerified/image — and anything added to User
 * later — from leaking into an API response by default.
 */
const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  deactivatedAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const

export type Member = Awaited<ReturnType<typeof listMembers>>[number]

export async function listMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId },
    select: MEMBER_SELECT,
    orderBy: [{ createdAt: 'asc' }],
  })
}

/**
 * The workspaces the signed-in user can currently act in — what GET /api/me reports and
 * what the client gates admin-only UI on.
 *
 * The `deactivatedAt: null` filter is what makes deactivation take effect. Sessions are
 * not workspace-scoped, so a deactivated member's cookie stays valid; the workspace just
 * disappears from here, and the client guard plus admin nav go with it. Do not remove it.
 */
export async function listMyMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId, deactivatedAt: null },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export type UpdateProfileInput = {
  userId: string
  name: string
  email: string
}

/**
 * Self-service profile edit. Scoped to `userId` from the session — never a client-
 * supplied id — so this cannot be turned into "edit anyone".
 *
 * Only name and email. Role is per-workspace and belongs to an admin; password goes
 * through Better Auth's /change-password, which verifies the current one and hashes
 * with the configured algorithm. Reimplementing either here would be a way to bypass
 * a check rather than a convenience.
 */
export async function updateProfile(input: UpdateProfileInput) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  const current = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  })

  if (!current) throw new UserNotFoundError()

  try {
    return await prisma.user.update({
      where: { id: input.userId },
      data: {
        name,
        email,
        // A new address has not been shown to belong to them. Nothing enforces this
        // today (requireEmailVerification is false, and there is no transport to send
        // a link through), but recording an unproven address as verified would leave
        // wrong data behind for the moment verification does land.
        ...(current.email === email ? {} : { emailVerified: false }),
      },
      select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
    })
  } catch (err) {
    // Someone else already holds the address. The unique constraint is the real check —
    // a pre-read would race.
    if (uniqueViolationOn(err, 'email')) throw new EmailTakenError()
    throw err
  }
}

/**
 * A password the admin reads out once and hands over out of band.
 *
 * This exists because transactional email is not wired up yet (SendGrid — see
 * implementation-plan.md). When it lands, this is replaced by an invitation token
 * mailed to the address; the rest of addMember does not change.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' // no O/0, I/l/1
const PASSWORD_LENGTH = 18

function generateTemporaryPassword(): string {
  // 256 is not a multiple of 58, so `byte % 58` would favour the first 24 characters.
  // Rejecting the short tail above the last whole multiple keeps the draw uniform.
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let out = ''

  while (out.length < PASSWORD_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH))) {
      if (byte >= limit) continue
      out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
      if (out.length === PASSWORD_LENGTH) break
    }
  }

  return out
}

export type AddMemberInput = {
  workspaceId: string
  name: string
  email: string
  role: Role
}

/**
 * Adds someone to a workspace, creating their account first if the address is new.
 *
 * An existing address is deliberately *not* an error: one email legitimately holds
 * different roles in different workspaces (Admin of their own, Client in a vendor's),
 * so a known user just gains a membership and no password is issued for them.
 *
 * TODO: that branch grants the membership with no consent from the account owner, and
 * the presence or absence of `temporaryPassword` in the response tells the calling
 * admin whether an arbitrary address already has an account here. Both go away with a
 * real invite: create the membership only once the invited user accepts. Blocked on
 * transactional email (SendGrid), same as the sibling TODO in workspace.ts. Until then
 * this is reachable only by an authenticated admin, and only for their own workspace.
 *
 * Like createWorkspaceWithAdmin, the user/account rows are written with Prisma rather
 * than Better Auth's adapter — that adapter holds its own client and would not enlist
 * in this transaction. Hashing still goes through ctx.password.hash, so the credential
 * is identical to a signup's.
 */
export async function addMember(input: AddMemberInput) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })

  if (existing) {
    try {
      const member = await prisma.membership.create({
        data: { userId: existing.id, workspaceId: input.workspaceId, role: input.role },
        select: MEMBER_SELECT,
      })
      return { member, temporaryPassword: undefined as string | undefined }
    } catch (err) {
      // Lost the race against a concurrent add, or they were already a member.
      if (uniqueViolationOn(err, 'userId') || uniqueViolationOn(err, 'workspaceId')) {
        throw new AlreadyMemberError()
      }
      throw err
    }
  }

  const ctx = await auth.$context
  const temporaryPassword = generateTemporaryPassword()
  const hashedPassword = await ctx.password.hash(temporaryPassword)
  const userId = newId(ctx, 'user')

  try {
    const member = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, name, email, emailVerified: false } })

      await tx.account.create({
        data: {
          id: newId(ctx, 'account'),
          accountId: userId, // for the credential provider Better Auth uses the user id
          providerId: 'credential',
          userId,
          password: hashedPassword,
        },
      })

      return tx.membership.create({
        data: { userId, workspaceId: input.workspaceId, role: input.role },
        select: MEMBER_SELECT,
      })
    })

    return { member, temporaryPassword: temporaryPassword as string | undefined }
  } catch (err) {
    // A concurrent add created the user between the lookup above and this insert.
    if (uniqueViolationOn(err, 'email')) throw new EmailTakenError()
    throw err
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Serialises every membership mutation for one workspace.
 *
 * Being inside a transaction is NOT enough to make the last-admin rule hold. Prisma
 * runs at the Postgres default of READ COMMITTED and `count()` takes no locks, so two
 * concurrent transactions demoting *different* admins each still see the other one as
 * active — neither has committed yet — and both pass the check. The workspace ends up
 * with zero admins, which nothing in the app can undo: every route is behind
 * requireWorkspaceRole('ADMIN'), so no one is left who can promote a replacement.
 *
 * Locking the workspace row makes the read-then-write actually atomic against other
 * writers here. It is a plain row lock, not the full workspace: readers elsewhere are
 * unaffected, and these are low-frequency admin actions.
 */
async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.$queryRaw`SELECT id FROM workspace WHERE id = ${workspaceId} FOR UPDATE`
}

/** Active admins in the workspace other than `exceptMembershipId`. */
async function otherActiveAdminCount(
  tx: Tx,
  workspaceId: string,
  exceptMembershipId: string,
) {
  return tx.membership.count({
    where: {
      workspaceId,
      role: 'ADMIN',
      deactivatedAt: null,
      id: { not: exceptMembershipId },
    },
  })
}

export type UpdateMemberRoleInput = {
  workspaceId: string
  membershipId: string
  role: Role
}

export async function updateMemberRole(input: UpdateMemberRoleInput) {
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId)

    // Scoped by workspaceId as well as id, so an admin of one workspace cannot even
    // confirm that a membership id exists in another.
    const current = await tx.membership.findFirst({
      where: { id: input.membershipId, workspaceId: input.workspaceId },
      select: { id: true, role: true, deactivatedAt: true },
    })

    if (!current) throw new MemberNotFoundError()

    const losingAnAdmin = current.role === 'ADMIN' && input.role !== 'ADMIN'
    if (losingAnAdmin && current.deactivatedAt === null) {
      const others = await otherActiveAdminCount(tx, input.workspaceId, current.id)
      if (others === 0) throw new LastAdminError()
    }

    return tx.membership.update({
      where: { id: current.id },
      data: { role: input.role },
      select: MEMBER_SELECT,
    })
  })
}

export type SetMemberActiveInput = {
  workspaceId: string
  membershipId: string
  active: boolean
  actorUserId: string
}

export async function setMemberActive(input: SetMemberActiveInput) {
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId)

    const current = await tx.membership.findFirst({
      where: { id: input.membershipId, workspaceId: input.workspaceId },
      select: { id: true, role: true, userId: true, deactivatedAt: true },
    })

    if (!current) throw new MemberNotFoundError()

    if (!input.active) {
      // Locking yourself out is never what you meant, and the last-admin rule below
      // would not catch it in a workspace that has a second admin.
      if (current.userId === input.actorUserId) throw new SelfDeactivationError()

      if (current.role === 'ADMIN' && current.deactivatedAt === null) {
        const others = await otherActiveAdminCount(tx, input.workspaceId, current.id)
        if (others === 0) throw new LastAdminError()
      }
    }

    return tx.membership.update({
      where: { id: current.id },
      data: { deactivatedAt: input.active ? null : new Date() },
      select: MEMBER_SELECT,
    })
  })
}

export type DeleteMemberInput = {
  workspaceId: string
  membershipId: string
  actorUserId: string
}

/** Which of the two things actually happened — the response says so, and the UI reports it. */
export type DeleteMemberResult = { deleted: 'account' | 'membership' }

/**
 * Removes someone from a workspace, erasing their account outright when this was the
 * only workspace they belonged to.
 *
 * Unlike deactivation this is irreversible: there is no row left to flip back.
 *
 * **Why it is not an unconditional `user.delete`.** One email legitimately holds
 * memberships in several workspaces (Admin of their own, Client in a vendor's). Wiping
 * the User row on behalf of one workspace's admin would destroy an account that another
 * tenant depends on — reaching outside the workspace this request is scoped to, which
 * is precisely what requireWorkspaceRole exists to prevent. So:
 *
 *   - last (or only) membership  → delete the User; Session, Account and Membership all
 *                                  cascade, leaving nothing behind. A complete wipe.
 *   - memberships elsewhere      → delete this membership only. They lose access here
 *                                  and keep the account they use elsewhere.
 *
 * Every account this app creates today has exactly one membership, so the first branch
 * is the normal path; the second is what stops a cross-tenant deletion.
 *
 * The same guards as deactivation apply, for the same reasons — and more sharply, since
 * deleting the last admin would be unrecoverable rather than merely wrong. lockWorkspace
 * runs first because "count the other admins, then write" is exactly the read-then-write
 * shape that READ COMMITTED does not make safe on its own.
 */
export async function deleteMember(input: DeleteMemberInput): Promise<DeleteMemberResult> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId)

    const current = await tx.membership.findFirst({
      where: { id: input.membershipId, workspaceId: input.workspaceId },
      select: { id: true, role: true, userId: true, deactivatedAt: true },
    })

    if (!current) throw new MemberNotFoundError()

    // Deleting yourself would revoke the session mid-request and, for a sole admin,
    // strand the workspace with no one able to administer it.
    if (current.userId === input.actorUserId) throw new SelfDeletionError()

    if (current.role === 'ADMIN' && current.deactivatedAt === null) {
      const others = await otherActiveAdminCount(tx, input.workspaceId, current.id)
      if (others === 0) throw new LastAdminError()
    }

    // Counted inside the transaction, behind the workspace lock, so a membership added
    // concurrently elsewhere cannot make this the wrong branch.
    const elsewhere = await tx.membership.count({
      where: { userId: current.userId, id: { not: current.id } },
    })

    if (elsewhere > 0) {
      await tx.membership.delete({ where: { id: current.id } })
      return { deleted: 'membership' }
    }

    // Cascades to session (signing them out everywhere), account (their credential)
    // and this membership.
    await tx.user.delete({ where: { id: current.userId } })
    return { deleted: 'account' }
  })
}
