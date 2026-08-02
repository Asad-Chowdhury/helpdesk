import { prisma } from './prisma'
import type { Tx } from './workspace-lock'

/**
 * "Can this account get in at all?"
 *
 * A session is only worth issuing to someone who holds at least one **active** membership
 * somewhere. Deactivation is per-workspace, so this is deliberately a question about the
 * account as a whole: someone deactivated in workspace A but still active in workspace B
 * signs in fine and simply stops seeing A.
 *
 * This is the single definition of that rule. It has two callers, and they are two halves
 * of the same guarantee:
 *
 *   - `auth.ts` blocks session creation, so a deactivated person cannot sign in.
 *   - `revokeSessionsWithoutAccess` below cuts off the sessions they already had, so
 *     deactivation takes effect immediately instead of when their cookie happens to expire.
 *
 * Without the second, "cannot log in" would coexist with "is still logged in" for up to
 * seven days — the worst of both, and the reason this file exists rather than a lone check
 * in the auth config.
 *
 * Note this is about *access*, not authentication: it runs after Better Auth has verified
 * the password, so it never influences whether a bad credential is accepted.
 */
export async function hasWorkspaceAccess(
  userId: string,
  client: Tx | typeof prisma = prisma,
): Promise<boolean> {
  const active = await client.membership.count({
    where: { userId, deactivatedAt: null },
  })

  return active > 0
}

/**
 * Deletes every session belonging to `userId` **if** they no longer hold an active
 * membership anywhere. A no-op for someone who still has access elsewhere.
 *
 * Call this after any write that can take away a person's last active membership —
 * deactivating them, or deleting a membership without deleting the account. Deleting the
 * *account* needs no call: `session` cascades from `user`.
 *
 * Pass the transaction client when the caller is inside one, so the revocation commits or
 * rolls back with the change that caused it. A revoked session for a deactivation that
 * then failed would sign someone out for no reason.
 *
 * Returns how many sessions were revoked, which is useful to assert on in tests.
 */
export async function revokeSessionsWithoutAccess(
  client: Tx | typeof prisma,
  userId: string,
): Promise<number> {
  if (await hasWorkspaceAccess(userId, client)) return 0

  const { count } = await client.session.deleteMany({ where: { userId } })
  return count
}
