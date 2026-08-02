import type { Role } from '../../generated/prisma/enums'
import { prisma } from '../../lib/prisma'
import { inboundRequireAuthResults, mailDomains } from '../../lib/env'
import { ticketScopeFor } from '../tickets/tickets.policy'
import { pickRecipient } from './addressing'
import { isAutomatedMessage } from './mime-headers'
import type { DropReason, InboundEmail } from './email.types'

/**
 * Deciding what an inbound message is *for*, and whether it is allowed to be.
 *
 * Everything here answers a question the intake service should not have to re-ask: which
 * workspace, which ticket (if any), and whether this sender may act on it. The service
 * then just writes.
 */

export type InboundSender = {
  userId: string
  name: string
  email: string
  role: Role
}

export type InboundTarget =
  | { kind: 'reply'; workspaceId: string; ticketId: string; sender: InboundSender; recipient: string }
  | { kind: 'new'; workspaceId: string; sender: InboundSender; recipient: string }
  | { kind: 'drop'; reason: DropReason; recipient: string; workspaceId?: string; ticketId?: string }

/**
 * Resolves the sender to an active member of this workspace.
 *
 * "Known senders only": an address with no active membership here cannot raise anything.
 * `allowUnknownSenders` on the workspace is the escape hatch, and is off by default —
 * an inbound address is public, so an open door is a spam and impersonation surface.
 *
 * Note that anonymous intake (when that flag is on) is deliberately *not* implemented yet:
 * it needs a requester with no `userId`, which the ticket columns already support
 * (`requesterId` is nullable next to non-null name/email snapshots) but which every other
 * path here assumes away. Turning the flag on today still drops, and says so.
 */
async function resolveSender(
  workspaceId: string,
  email: string,
): Promise<InboundSender | DropReason> {
  const membership = await prisma.membership.findFirst({
    where: {
      workspaceId,
      user: { email: email.toLowerCase() },
    },
    select: {
      role: true,
      deactivatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })

  if (!membership) return 'unknown-sender'
  // A deactivated member is refused separately from an unrecognised one: the distinction
  // is invisible over HTTP (every drop is "ignored") but it is exactly what someone
  // reading the InboundEmail log needs to tell "who is this" from "they used to work here".
  if (membership.deactivatedAt !== null) return 'inactive-member'

  return {
    userId: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
  }
}

/**
 * Whether this sender may append to this ticket.
 *
 * **Replies are gated harder than new tickets, on purpose.** A reply token travels in an
 * email address, so anyone forwarded a copy of the thread holds it. Re-deriving the same
 * visibility rule the API uses is what stops a token becoming a way to post into a ticket
 * its holder could not otherwise see.
 */
async function canAppendToTicket(
  workspaceId: string,
  ticketId: string,
  sender: InboundSender,
): Promise<boolean> {
  const scope = ticketScopeFor(sender.role)
  if (scope === 'all') {
    return (await prisma.ticket.count({ where: { id: ticketId, workspaceId } })) > 0
  }

  const where =
    scope === 'assigned_or_requested'
      ? { OR: [{ assigneeId: sender.userId }, { requesterId: sender.userId }] }
      : { requesterId: sender.userId }

  return (
    (await prisma.ticket.count({ where: { id: ticketId, workspaceId, AND: [where] } })) > 0
  )
}

/**
 * Works out what to do with a delivery.
 *
 * Order of checks is deliberate — cheapest and most categorical first, so an autoresponder
 * loop is stopped before any database work, and nothing that could create a record happens
 * until the sender has been proven.
 */
export async function resolveInboundTarget(email: InboundEmail): Promise<InboundTarget> {
  const picked = pickRecipient(email.envelopeTo, mailDomains)
  const recipient = picked?.address ?? email.envelopeTo[0] ?? 'unknown'

  if (!picked) return { kind: 'drop', reason: 'no-matching-recipient', recipient }

  // Never reply to a robot, and never let one open a ticket. Our acknowledgement would
  // trigger theirs and the two systems would mail each other indefinitely.
  if (isAutomatedMessage(email.headers)) {
    return { kind: 'drop', reason: 'automated-message', recipient }
  }

  // Mail from our own domain is either our own notification bouncing back or a loop.
  const senderHost = email.from.email.split('@')[1]?.toLowerCase()
  if (senderHost && mailDomains.includes(senderHost)) {
    return { kind: 'drop', reason: 'mail-loop', recipient }
  }

  if (inboundRequireAuthResults) {
    const spfOk = email.auth.spf === 'pass'
    const dkimOk = email.auth.dkim === true
    // Either passing is enough: DKIM survives forwarding where SPF does not, and SPF
    // covers senders who do not sign. Requiring both would drop a lot of legitimate mail.
    if (!spfOk && !dkimOk) {
      return { kind: 'drop', reason: 'auth-results-failed', recipient }
    }
  }

  if (picked.parsed.kind === 'reply') {
    const ticket = await prisma.ticket.findUnique({
      where: { replyToken: picked.parsed.token },
      select: { id: true, workspaceId: true },
    })
    if (!ticket) return { kind: 'drop', reason: 'ticket-not-found', recipient }

    const sender = await resolveSender(ticket.workspaceId, email.from.email)
    if (typeof sender === 'string') {
      return { kind: 'drop', reason: sender, recipient, workspaceId: ticket.workspaceId }
    }

    if (!(await canAppendToTicket(ticket.workspaceId, ticket.id, sender))) {
      return {
        kind: 'drop',
        reason: 'ticket-not-visible',
        recipient,
        workspaceId: ticket.workspaceId,
        ticketId: ticket.id,
      }
    }

    return {
      kind: 'reply',
      workspaceId: ticket.workspaceId,
      ticketId: ticket.id,
      sender,
      recipient,
    }
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: picked.parsed.slug },
    select: { id: true },
  })
  if (!workspace) return { kind: 'drop', reason: 'unknown-workspace', recipient }

  const sender = await resolveSender(workspace.id, email.from.email)
  if (typeof sender === 'string') {
    return { kind: 'drop', reason: sender, recipient, workspaceId: workspace.id }
  }

  return { kind: 'new', workspaceId: workspace.id, sender, recipient }
}
