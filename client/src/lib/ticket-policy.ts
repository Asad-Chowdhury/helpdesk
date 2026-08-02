import type { Role } from './me'
import type { Ticket } from './tickets'

/**
 * A mirror of `server/src/modules/tickets/tickets.policy.ts`, for deciding what to render.
 *
 * **This is not authorization.** Every rule here is enforced again on the server, which is
 * the only place it counts — hiding a button stops a mistake, not an attacker, and a caller
 * with curl never loads this file. The copy exists so the UI does not offer a control that
 * is going to come back 403, which reads as a bug to the user.
 *
 * Keep the two in step. If a rule changes, change it on the server first; this file
 * following is cosmetic, this file leading is a security bug waiting for the server to
 * catch up.
 */

const STAFF_SIDE: readonly Role[] = ['ADMIN', 'MANAGER', 'STAFF']
const LEAD_SIDE: readonly Role[] = ['ADMIN', 'MANAGER']

/**
 * Whether this role sees the whole queue or only their own slice.
 *
 * Admin and Manager see everything; Staff see tickets assigned to them plus any they
 * raised; a Client sees only what they raised. The server does the actual narrowing —
 * this exists so the queue does not offer an assignee filter to someone whose results are
 * already constrained to themselves.
 */
export function seesWholeQueue(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

/**
 * Admin and Manager raise tickets. Staff work what they are assigned — a ticket they
 * raised would make them the requester, not the assignee, and so would fall outside the
 * only slice of the queue they can see.
 */
export function canCreateTicket(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

export function canEditTicketFields(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

export function canAssign(role: Role): boolean {
  return LEAD_SIDE.includes(role)
}

/** Staff may only move tickets assigned to them — the whole of "works assigned tickets only". */
export function canChangeStatus(role: Role, userId: string, ticket: Ticket): boolean {
  if (LEAD_SIDE.includes(role)) return true
  if (role === 'STAFF') return ticket.assignee?.id === userId
  return false
}

/** Admin only, stated twice in project-scope.md §1. Not an oversight to be widened. */
export function canSetPriority(role: Role): boolean {
  return role === 'ADMIN'
}

export function canUseInternalNotes(role: Role): boolean {
  return STAFF_SIDE.includes(role)
}

export function canDeleteTicket(role: Role): boolean {
  return role === 'ADMIN'
}
