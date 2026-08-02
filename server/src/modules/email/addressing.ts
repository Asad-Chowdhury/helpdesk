/**
 * Every email address this system mints or recognises.
 *
 * Two address shapes exist, and keeping them in one file is what stops the generator and
 * the parser drifting apart:
 *
 *   - **Intake:**  `<workspace-slug>@<MAIL_DOMAIN>`  — raises a new ticket.
 *   - **Reply:**   `reply+<token>@<MAIL_DOMAIN>`     — appends to the ticket holding that
 *                                                      token, and is what we put in the
 *                                                      Reply-To of every notification.
 *
 * **Why the reply prefix is a fixed `reply` and not the workspace slug.** The obvious
 * `<slug>+<token>@` does not fit: `slugify()` in services/workspace.ts caps a slug at 48
 * characters, plus `+`, plus a 32-character token is 81 octets, and RFC 5321 limits a
 * local part to 64. `reply+<token>` is 38. It also keeps tenant slugs out of headers that
 * get forwarded around, and survives a workspace rename.
 */

/** Token length in bytes before hex encoding. 16 bytes = 128 bits = 32 hex characters. */
const TOKEN_BYTES = 16

const TOKEN_PATTERN = /^[a-f0-9]{32}$/
const REPLY_LOCAL_PATTERN = /^reply\+([a-f0-9]{32})$/

/**
 * A ticket's threading token.
 *
 * Lowercase hex, matching what the migration's `replace(gen_random_uuid()::text, '-', '')`
 * backfill produced, so the parser only ever has to recognise one alphabet.
 *
 * 128 bits because this is a bearer credential: anyone who can guess it can attempt to
 * post into a thread. `crypto.getRandomValues` is the same CSPRNG the temporary-password
 * generator uses — never `Math.random`.
 */
export function newReplyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isReplyToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

/** The address a reply to `token` should be sent to. Used as Reply-To on every send. */
export function replyAddressFor(token: string, domain: string): string {
  return `reply+${token}@${domain}`
}

/** The address that raises a new ticket in the workspace with this slug. */
export function inboundAddressFor(slug: string, domain: string): string {
  return `${slug}@${domain}`
}

export type ParsedRecipient =
  /** `reply+<token>@domain` — append to an existing ticket. */
  | { kind: 'reply'; token: string }
  /** `<slug>@domain` — raise a new ticket in that workspace. */
  | { kind: 'workspace'; slug: string }
  /** Not one of ours: wrong host, or a local part matching neither shape. */
  | { kind: 'unknown' }

/**
 * Classifies one recipient address.
 *
 * Callers must only ever pass **envelope** recipients (SMTP `RCPT TO`), never the `To:` or
 * `Cc:` headers. The envelope is what actually caused delivery; the headers are free text
 * a sender composes and can put anything in.
 *
 * Case: the local part is lowercased before matching. RFC 5321 says a local part is
 * technically case-sensitive, but no real MTA preserves it reliably and every mail system
 * in practice treats it case-insensitively — matching case-sensitively would drop replies
 * for no benefit. Domains are case-insensitive by definition.
 *
 * Sub-addressing beyond our own (`acme+anything@`) is deliberately *not* stripped down to
 * `acme`: only the exact `reply+<32 hex>` shape is special, and anything else is unknown
 * rather than being guessed at.
 */
export function parseRecipient(address: string, domains: string[]): ParsedRecipient {
  const at = address.lastIndexOf('@')
  if (at <= 0) return { kind: 'unknown' }

  const local = address.slice(0, at).trim().toLowerCase()
  const host = address.slice(at + 1).trim().toLowerCase()

  if (!domains.some((d) => d.toLowerCase() === host)) return { kind: 'unknown' }

  const reply = REPLY_LOCAL_PATTERN.exec(local)
  if (reply) return { kind: 'reply', token: reply[1]! }

  // A slug is what slugify() produces: lowercase alphanumerics and dashes, no leading or
  // trailing dash. Checking the shape here means an obviously-bogus local part never
  // reaches the database.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(local)) return { kind: 'workspace', slug: local }

  return { kind: 'unknown' }
}

/**
 * The first recipient that is one of ours, preferring a reply over a new ticket.
 *
 * Order matters when a message is addressed to both — someone replies to a thread and
 * CCs the workspace intake address. Threading it onto the existing ticket is right;
 * opening a duplicate is not.
 */
export function pickRecipient(
  envelopeTo: string[],
  domains: string[],
): { address: string; parsed: Exclude<ParsedRecipient, { kind: 'unknown' }> } | null {
  const parsed = envelopeTo.map((address) => ({
    address: address.trim().toLowerCase(),
    parsed: parseRecipient(address, domains),
  }))

  // The narrowed return type is the invariant: this only ever yields a recipient that is
  // actually ours, so callers never have to handle an 'unknown' that cannot occur.
  const isOurs = (r: {
    address: string
    parsed: ParsedRecipient
  }): r is { address: string; parsed: Exclude<ParsedRecipient, { kind: 'unknown' }> } =>
    r.parsed.kind !== 'unknown'

  return (
    parsed.filter(isOurs).find((r) => r.parsed.kind === 'reply') ??
    parsed.filter(isOurs).find((r) => r.parsed.kind === 'workspace') ??
    null
  )
}
