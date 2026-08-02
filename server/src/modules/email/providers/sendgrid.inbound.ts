import { isAutomatedMessage, messageIdsFrom, normaliseMessageId, parseHeaderBlock } from '../mime-headers'
import type { EmailAddress, InboundAttachment, InboundEmail } from '../email.types'

/**
 * The SendGrid Inbound Parse boundary.
 *
 * This is the only file that knows SendGrid's field names. Everything downstream consumes
 * the neutral `InboundEmail`, so moving to Postmark or Mailgun means adding a sibling here
 * and changing nothing else.
 *
 * **Configure Inbound Parse with "POST the raw, full MIME message" OFF.** The parsed form
 * hands us `text`, `html`, `subject`, `from` and `envelope` already separated; the raw form
 * would make a MIME-parser dependency mandatory for no gain.
 *
 * Field reference (parsed mode): `headers`, `text`, `html`, `from`, `to`, `cc`, `subject`,
 * `envelope` (JSON with `to[]`/`from`), `charsets` (JSON), `SPF`, `dkim`, `spam_score`,
 * `attachments` (count) and `attachment-info` (JSON).
 */

export type SendGridInboundFields = Record<string, string>

/**
 * SendGrid's `envelope` is a JSON string. Anything malformed is treated as absent rather
 * than throwing — a webhook must not 500 on a field it could route without.
 */
function parseEnvelope(raw: string | undefined): { to: string[]; from: string | null } {
  if (!raw) return { to: [], from: null }

  try {
    const parsed = JSON.parse(raw) as { to?: unknown; from?: unknown }
    const to = Array.isArray(parsed.to) ? parsed.to.filter((v): v is string => typeof v === 'string') : []
    return {
      to: to.map((address) => address.trim().toLowerCase()),
      from: typeof parsed.from === 'string' ? parsed.from.trim().toLowerCase() : null,
    }
  } catch {
    return { to: [], from: null }
  }
}

/**
 * Splits `Display Name <addr@host>` into its parts.
 *
 * Only the first address is taken: `From` is permitted to carry several, but a message
 * with multiple authors has no meaningful single requester, and the first is the one every
 * mail client displays.
 */
export function parseAddress(raw: string | undefined): EmailAddress {
  const value = (raw ?? '').split(',')[0]?.trim() ?? ''

  const angled = /^(.*?)<([^>]+)>\s*$/.exec(value)
  if (angled) {
    const name = angled[1]!.trim().replace(/^"(.*)"$/, '$1').trim()
    return { email: angled[2]!.trim().toLowerCase(), ...(name ? { name } : {}) }
  }

  return { email: value.toLowerCase() }
}

/**
 * SendGrid reports SPF as a bare result word (`pass`, `softfail`, `fail`, `none`…) and
 * dkim as a string like `{@example.com : pass}`.
 */
function parseDkim(raw: string | undefined): boolean | null {
  if (!raw) return null
  return /\bpass\b/i.test(raw)
}

function parseAttachmentInfo(raw: string | undefined): InboundAttachment[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Record<string, { filename?: string; type?: string }>
    return Object.values(parsed).map((info) => ({
      filename: info.filename ?? 'attachment',
      contentType: info.type ?? 'application/octet-stream',
      // Parse mode reports no size; the multipart layer counts bytes as it drains and
      // overwrites this. Zero here means "not measured", never "empty file".
      bytes: 0,
    }))
  } catch {
    return []
  }
}

/**
 * Maps a parsed Inbound Parse POST to the neutral type.
 *
 * `attachments` comes from the multipart layer, which counted bytes while discarding the
 * streams — SendGrid's own `attachment-info` has filenames but no sizes, so the two are
 * merged with the measured values winning.
 */
export function toInboundEmail(
  fields: SendGridInboundFields,
  measuredAttachments: InboundAttachment[] = [],
): InboundEmail {
  const headers = parseHeaderBlock(fields['headers'] ?? '')
  const envelope = parseEnvelope(fields['envelope'])

  // The envelope is authoritative for routing. Falling back to the `to` field is only for
  // the case where a provider omits the envelope entirely — noted, not relied on.
  const envelopeTo = envelope.to.length > 0
    ? envelope.to
    : [parseAddress(fields['to']).email].filter(Boolean)

  const declared = parseAttachmentInfo(fields['attachment-info'])
  const attachments = measuredAttachments.length > 0 ? measuredAttachments : declared

  const spamScore = Number(fields['spam_score'])

  return {
    envelopeTo,
    envelopeFrom: envelope.from,
    from: parseAddress(fields['from']),
    subject: (fields['subject'] ?? '').trim(),
    text: fields['text'] ?? '',
    html: fields['html'] || null,
    headers,
    messageId: normaliseMessageId(headers['message-id']),
    inReplyTo: messageIdsFrom(headers['in-reply-to'])[0] ?? null,
    references: messageIdsFrom(headers['references']),
    attachments,
    auth: {
      spf: fields['SPF']?.trim().toLowerCase() ?? null,
      dkim: parseDkim(fields['dkim']),
    },
    spamScore: Number.isFinite(spamScore) ? spamScore : null,
    receivedAt: new Date(),
  }
}

/** Re-exported so the routing layer does not need to import from `mime-headers` too. */
export { isAutomatedMessage }
