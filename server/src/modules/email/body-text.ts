/**
 * Turning an email body into the text that goes on a ticket.
 *
 * Two problems, both cosmetic in principle and both the difference between a readable
 * thread and an unusable one in practice: some senders write HTML only, and every reply
 * carries the entire prior conversation quoted underneath it.
 */

/**
 * A crude HTML-to-text fallback, used only when a message has no `text/plain` part.
 *
 * Deliberately not a dependency. This handles the shape real mail clients emit — block
 * elements become line breaks, `<br>` becomes one, tags are stripped, the handful of
 * entities that actually appear get decoded. It will mangle a table-based marketing
 * layout, and that is an acceptable outcome for something that should not be a support
 * request in the first place.
 *
 * Upgrade to a real converter if HTML-only senders turn out to be common; the seam is
 * this one function.
 */
export function htmlToText(html: string): string {
  return html
    // Content of these is never body text.
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Ampersand last, or it would double-decode the entities above.
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Markers that begin the quoted history in a reply.
 *
 * There is no standard for this — every client invents its own — so this is a list of what
 * the common ones emit, and it will never be exhaustive. Erring towards keeping too much
 * is deliberate: a comment with some quoted text below it is untidy, whereas over-eager
 * trimming silently destroys what the person actually wrote.
 */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{5,}\s*$/m, // Outlook's horizontal rule above the quoted block
  /^On .{10,80}\bwrote:\s*$/im, // Gmail/Apple Mail: "On <date>, <person> wrote:"
  /^From:\s.+\nSent:\s/im, // Outlook's quoted header block
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^Sent from my \w+/im,
]

/**
 * Strips the quoted history from a reply, keeping only what this person just wrote.
 *
 * Without it, every reply appends the whole thread again and a ticket becomes unreadable
 * after three exchanges.
 *
 * Runs the marker search first and only then drops trailing `>` lines, because a `>` block
 * *above* a marker is usually being quoted deliberately (someone answering inline), while
 * one at the very end is the client's automatic quote.
 */
export function stripQuotedReply(text: string): string {
  let cut = text.length

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text)
    if (match && match.index < cut) cut = match.index
  }

  let body = text.slice(0, cut)

  // Trailing quote block with no marker above it — common in plain-text replies.
  const lines = body.split(/\r?\n/)
  let end = lines.length
  while (end > 0) {
    const line = lines[end - 1]!.trim()
    if (line === '' || line.startsWith('>')) end--
    else break
  }
  if (end < lines.length) body = lines.slice(0, end).join('\n')

  const trimmed = body.replace(/\n{3,}/g, '\n\n').trim()

  // If stripping left nothing, the whole message was quoted or the markers misfired.
  // Returning the original is the safer failure: a noisy comment beats an empty one.
  return trimmed || text.trim()
}

/**
 * The single entry point: the best available body text for a ticket or comment.
 *
 * Prefers `text/plain` — it is what the sender's client produced from what they typed, and
 * needs no lossy conversion.
 */
export function bodyTextFrom(input: {
  text: string | null
  html: string | null
  stripQuoted: boolean
}): string {
  const raw = input.text?.trim() || (input.html ? htmlToText(input.html) : '')
  if (!raw) return ''

  return input.stripQuoted ? stripQuotedReply(raw) : raw
}
