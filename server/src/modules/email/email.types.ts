/**
 * The provider-neutral shape of an inbound message.
 *
 * Everything downstream of the adapter speaks this and only this. Swapping SendGrid for
 * Postmark or Mailgun should mean writing one new file in `providers/` and changing
 * nothing else — so nothing here may be named after a provider or shaped by one's quirks.
 */

export type EmailAddress = {
  email: string
  name?: string
}

/**
 * An attachment we saw but did not keep.
 *
 * File storage is blocked on Cloudflare R2 (a later phase), so parts are counted and
 * discarded as they stream past. **The bytes are gone permanently** — this is a record of
 * what was lost so the ticket can say so, not a queue to replay later.
 */
export type InboundAttachment = {
  filename: string
  contentType: string
  bytes: number
}

export type InboundEmail = {
  /**
   * SMTP `RCPT TO`, lowercased. Routing uses *only* these — never the `To:`/`Cc:` headers,
   * which are free text the sender composes.
   */
  envelopeTo: string[]
  envelopeFrom: string | null

  from: EmailAddress
  subject: string

  /** Best available body text, already HTML-converted and quote-stripped as appropriate. */
  text: string
  html: string | null

  /** Lowercased header names → first value seen. */
  headers: Record<string, string>

  /** Angle brackets stripped, lowercased. Null when the sender omitted the header. */
  messageId: string | null
  inReplyTo: string | null
  references: string[]

  attachments: InboundAttachment[]

  /**
   * Sender-authentication results from the provider.
   *
   * Load-bearing, not decorative: `from.email` is trivially forgeable over SMTP, so
   * without these "known senders only" secures nothing — it merely tells an attacker which
   * address to forge.
   */
  auth: {
    spf: string | null
    dkim: boolean | null
  }
  spamScore: number | null

  receivedAt: Date
}

/**
 * Why a delivery produced nothing.
 *
 * Stored on the `InboundEmail` row rather than only logged, because "my email never became
 * a ticket" is otherwise unanswerable. Never exposed over HTTP: the webhook collapses
 * every one of these to `{"status":"ignored"}` so the endpoint cannot be used to probe
 * which workspaces or members exist.
 */
export type DropReason =
  | 'no-matching-recipient'
  | 'unknown-workspace'
  | 'unknown-sender'
  | 'inactive-member'
  | 'ticket-not-found'
  | 'ticket-not-visible'
  | 'auth-results-failed'
  | 'automated-message'
  | 'mail-loop'
  | 'sender-throttled'
  | 'empty-body'

export type IntakeOutcome =
  | { status: 'created'; ticketId: string; number: number }
  | { status: 'appended'; ticketId: string; commentId: string }
  | { status: 'duplicate' }
  | { status: 'dropped'; reason: DropReason }
