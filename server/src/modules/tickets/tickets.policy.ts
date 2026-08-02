import type { Role } from '../../generated/prisma/enums'

/**
 * Who may do what to a ticket.
 *
 * Every rule from project-scope.md §1 (Roles) and §4 (Workflow Management) lives here as
 * a named predicate, so a route reads as the rule it enforces and there is one place to
 * check when the scope document changes. These run *after* `requireWorkspaceRole`, which
 * has already proved the caller holds an active membership in this workspace — so these
 * answer "may this role do this", never "may they touch this workspace at all".
 *
 * The scope rules, verbatim in effect:
 *   - Admin    — full control; the ONLY role that can manually override priority.
 *   - Manager  — near-Admin: assignment, categories, status. No priority override.
 *   - Staff    — works assigned tickets only; may transition status. No priority override.
 *   - Client   — watcher: view/track their OWN tickets only.
 *
 * Two scope items are deliberately not implemented yet and are called out at their rule:
 * the per-client "may raise tickets" grant, and automatic routing rules.
 */

/** Roles that work inside the workspace, as opposed to watching it from outside. */
const STAFF_SIDE: readonly Role[] = ['ADMIN', 'MANAGER', 'STAFF']

/** Roles with authority over other people's tickets. */
const LEAD_SIDE: readonly Role[] = ['ADMIN', 'MANAGER']

/**
 * Which tickets a role may see at all. Three distinct answers, not a boolean:
 *
 *   - `'all'`                   — Admin and Manager see the whole queue.
 *   - `'assigned_or_requested'` — Staff see tickets assigned to them, plus any they
 *                                 raised themselves.
 *   - `'requested'`             — a Client is a watcher over the requests they raised.
 *
 * **Why Staff also see what they raised.** Their scope was "assigned to me" alone, which
 * silently broke the moment a Staff member could become a *requester*: they would create
 * a ticket and immediately lose sight of it, because raising one makes you the requester,
 * not the assignee. That is why `canCreateTicket` had to exclude them. Email intake makes
 * the same thing happen through a second door — a Staff member mailing the workspace
 * address is the requester of the resulting ticket — so the scope is widened here rather
 * than papered over at each entry point.
 *
 * Seeing is not editing: `canChangeStatus` still requires the ticket to be assigned to
 * them, so a Staff member can watch and comment on a request they raised without being
 * able to transition it.
 *
 * This is the *only* definition of ticket visibility. Every read path derives its `where`
 * from it (`visibilityFilter` in tickets.service.ts) and every single-ticket path — get,
 * patch, comment — runs through the same filter, so a ticket a caller may not see is
 * uniformly a 404 rather than being reachable by id.
 *
 * It must be applied by narrowing the query, never by filtering results: filtering
 * afterwards still loads another person's ticket into memory, and still leaks its
 * existence through the pagination total.
 */
export type TicketScope = 'all' | 'assigned_or_requested' | 'requested'

export function ticketScopeFor(role: Role): TicketScope {
  if (LEAD_SIDE.includes(role)) return 'all'
  if (role === 'STAFF') return 'assigned_or_requested'
  return 'requested'
}

/**
 * Raising a ticket is a lead's action. Staff work the queue they are given — their whole
 * capability set is "comment and change status" — and Clients have no grant yet.
 *
 * **Staff being excluded here is not cosmetic, it is required by the scope rule.** Staff
 * see only tickets *assigned* to them, and a ticket they raise makes them the requester,
 * not the assignee — so it would vanish the instant it was created, and `createTicket`'s
 * re-read (which runs through the caller's own visibility) would fail outright. If staff
 * should be able to raise tickets, the fix is to widen their scope to "assigned to me OR
 * raised by me" in `ticketScopeFor`, not to re-enable this on its own.
 *
 * For Clients, project-scope.md §1 makes it a per-client grant ("Admin can additionally
 * grant a Client permission to raise tickets manually"). There is no column for that grant
 * on Membership, so the honest implementation of "no grant exists" is to refuse.
 */
export function canCreateTicket(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

/** Editing the request itself — subject, description, category. */
export function canEditTicketFields(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

/**
 * Manual assignment is a lead's call. Staff work what they are given rather than claiming
 * or reassigning work, per §4's split between "manual assignment" and "works assigned
 * tickets only".
 */
export function canAssign(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

/**
 * Status transitions. Admin and Manager on any ticket; Staff only on a ticket assigned to
 * them — that is the whole of "works assigned tickets only".
 *
 * Takes the assignee id rather than the ticket so it cannot accidentally be handed a
 * ticket from another workspace and quietly answer about it.
 */
export function canChangeStatus(
  role: Role,
  userId: string,
  ticketAssigneeId: string | null,
): boolean {
  if (LEAD_SIDE.includes(role)) return true
  if (role === 'STAFF') return ticketAssigneeId === userId
  return false
}

/**
 * Priority override is Admin-only — stated twice in the scope document (§1 under Admin and
 * again under Manager, which explicitly "cannot override priority"), so it is not an
 * oversight to be tidied into LEAD_SIDE later.
 */
export function canSetPriority(role: Role): boolean {
  return role === 'ADMIN'
}

/**
 * Internal notes are staff-side by definition. This gates both reading and writing them:
 * a Client who could write one could not see their own note afterwards, which is a worse
 * outcome than refusing.
 */
export function canUseInternalNotes(role: Role): boolean {
  return STAFF_SIDE.includes(role)
}

/**
 * Deleting a ticket destroys the workspace's record of a request, including its whole
 * activity history. Admin only, and the UI asks for confirmation first.
 */
export function canDeleteTicket(role: Role): boolean {
  return role === 'ADMIN'
}

/**
 * Commenting on a ticket the caller can already see. Clients comment on their own tickets
 * — that is the point of the portal — so this is everyone, and the ticket-level visibility
 * check is what does the real work.
 */
export function canComment(): boolean {
  return true
}
