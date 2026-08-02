import { prisma } from '../../lib/prisma'
import { uniqueViolationOn } from '../../services/workspace'
import { addEmailComment, createTicketFromEmail } from '../tickets/tickets.service'
import { bodyTextFrom } from './body-text'
import { resolveInboundTarget, type InboundTarget } from './inbound.routing'
import type { DropReason, InboundAttachment, InboundEmail, IntakeOutcome } from './email.types'

/** Ticket subject/body limits, matching the zod rules the web form is held to. */
const MAX_SUBJECT = 200
const MAX_BODY = 10_000

const DEFAULT_SUBJECT = '(no subject)'

/**
 * The dedupe key.
 *
 * Prefers the sender's `Message-ID`. When absent — rare, but real for scripted senders —
 * a content hash stands in. The consequence is worth stating plainly: two genuinely
 * identical emails from the same person with no Message-ID are treated as a retry and the
 * second is dropped. That is the right trade, because a duplicate ticket is worse than a
 * dropped duplicate, and it only applies to the synthesized case.
 */
async function dedupeKey(email: InboundEmail): Promise<string> {
  if (email.messageId) return email.messageId

  const material = [
    email.envelopeTo.join(','),
    email.from.email,
    email.subject,
    email.text.slice(0, 8192),
  ].join('\n')

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

/**
 * A visible note about attachments we could not keep.
 *
 * Silently dropping them is the worst option: someone writes "brief attached", staff see a
 * bare paragraph, and nobody ever learns why. File storage is blocked on R2, so the bytes
 * really are gone — saying so in the ticket is the honest minimum.
 */
function attachmentNote(attachments: InboundAttachment[]): string {
  if (attachments.length === 0) return ''

  const listed = attachments
    .map((a) => (a.bytes > 0 ? `${a.filename} (${Math.ceil(a.bytes / 1024)} KB)` : a.filename))
    .join(', ')

  return (
    `\n\n---\n${attachments.length} attachment${attachments.length === 1 ? '' : 's'} ` +
    `arrived with this email and could not be stored: ${listed}. ` +
    `Please share ${attachments.length === 1 ? 'it' : 'them'} as a link for now.`
  )
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Logs the delivery and what it produced. Never throws — logging must not fail intake. */
async function recordDrop(
  email: InboundEmail,
  key: string,
  target: Extract<InboundTarget, { kind: 'drop' }>,
): Promise<void> {
  try {
    await prisma.inboundEmail.create({
      data: {
        messageId: key,
        recipient: target.recipient,
        fromEmail: email.from.email,
        subject: email.subject || null,
        outcome: 'DROPPED',
        dropReason: target.reason,
        workspaceId: target.workspaceId ?? null,
        ticketId: target.ticketId ?? null,
        attachments: email.attachments.length > 0 ? email.attachments : undefined,
        spfResult: email.auth.spf,
        dkimPass: email.auth.dkim,
        spamScore: email.spamScore,
      },
    })
  } catch (err) {
    // A repeat of an already-dropped message hits the unique constraint. That is not a
    // problem worth failing the request over — the drop is already on record.
    if (!uniqueViolationOn(err, 'messageId') && !uniqueViolationOn(err, 'recipient')) {
      console.error('[email] could not record dropped delivery:', err)
    }
  }
}

const dropped = (reason: DropReason): IntakeOutcome => ({ status: 'dropped', reason })

/**
 * Turns one inbound message into a ticket, a comment, or nothing.
 *
 * **Idempotency is the shape of this function.** The `InboundEmail` row is inserted as the
 * *first* statement inside the same transaction as the ticket or comment write. A provider
 * retry hits `@@unique([recipient, messageId])`, the whole transaction rolls back, and the
 * caller answers "duplicate" — no second ticket, no duplicate comment.
 *
 * Doing it as a pre-check instead would be the same read-then-write race `lockWorkspace`
 * exists for: two simultaneous retries would both find nothing and both proceed.
 */
export async function ingestInboundEmail(email: InboundEmail): Promise<IntakeOutcome> {
  const key = await dedupeKey(email)
  const target = await resolveInboundTarget(email)

  if (target.kind === 'drop') {
    await recordDrop(email, key, target)
    return dropped(target.reason)
  }

  // A reply carries the whole prior thread quoted underneath; a new ticket does not.
  const body = bodyTextFrom({
    text: email.text,
    html: email.html,
    stripQuoted: target.kind === 'reply',
  })

  if (!body.trim() && email.attachments.length === 0) {
    await recordDrop(email, key, { kind: 'drop', reason: 'empty-body', recipient: target.recipient })
    return dropped('empty-body')
  }

  const withAttachments = clamp(body + attachmentNote(email.attachments), MAX_BODY)

  try {
    return await prisma.$transaction(async (tx) => {
      // FIRST — this is what makes a retry a no-op rather than a duplicate.
      await tx.inboundEmail.create({
        data: {
          messageId: key,
          recipient: target.recipient,
          fromEmail: email.from.email,
          subject: email.subject || null,
          outcome: target.kind === 'reply' ? 'COMMENT_APPENDED' : 'TICKET_CREATED',
          workspaceId: target.workspaceId,
          ticketId: target.kind === 'reply' ? target.ticketId : null,
          attachments: email.attachments.length > 0 ? email.attachments : undefined,
          spfResult: email.auth.spf,
          dkimPass: email.auth.dkim,
          spamScore: email.spamScore,
        },
      })

      if (target.kind === 'reply') {
        const comment = await addEmailComment(
          tx,
          target.workspaceId,
          target.ticketId,
          target.sender,
          withAttachments,
        )
        return { status: 'appended', ticketId: target.ticketId, commentId: comment.id } as const
      }

      const ticket = await createTicketFromEmail(tx, target.workspaceId, target.sender, {
        subject: clamp(email.subject.trim() || DEFAULT_SUBJECT, MAX_SUBJECT),
        description: withAttachments,
      })
      return { status: 'created', ticketId: ticket.id, number: ticket.number } as const
    })
  } catch (err) {
    if (uniqueViolationOn(err, 'messageId') || uniqueViolationOn(err, 'recipient')) {
      return { status: 'duplicate' }
    }
    throw err
  }
}
