import { prisma } from './prisma'

/** The transactional client Prisma hands to a `$transaction` callback. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Serialises the write it guards against every other writer holding this workspace's lock.
 *
 * **Being inside a transaction is not enough.** Prisma runs at the Postgres default of
 * READ COMMITTED and neither `count()` nor `max()` takes any lock, so two concurrent
 * transactions each read a state the other is about to change, both pass their check, and
 * both commit. That is not hypothetical — it produced a workspace with zero admins in
 * 7 of 8 concurrent attempts before this lock existed (0 of 8 with it), and a workspace
 * with no admin cannot be repaired from inside the app, because every route that could
 * promote a replacement is behind `requireWorkspaceRole('ADMIN')`.
 *
 * **Use it for any read-then-write on workspace-scoped data**, which is the shape of:
 *   - "count the active admins, then demote/deactivate/delete one" (users.service.ts)
 *   - "find the highest ticket number, then insert the next one" (tickets.service.ts)
 *
 * It locks one row — the workspace itself — not the tables underneath. Readers elsewhere
 * are unaffected; only other holders of this lock wait.
 */
export async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.$queryRaw`SELECT id FROM workspace WHERE id = ${workspaceId} FOR UPDATE`
}
