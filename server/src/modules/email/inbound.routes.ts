import { Router, type NextFunction, type Request, type Response } from 'express'
import busboy from 'busboy'
import { timingSafeEqual } from 'node:crypto'
import {
  inboundEmailEnabled,
  inboundMaxBytes,
  inboundWebhookPassword,
  inboundWebhookUser,
} from '../../lib/env'
import { toInboundEmail, type SendGridInboundFields } from './providers/sendgrid.inbound'
import { ingestInboundEmail } from './inbound.service'
import type { InboundAttachment } from './email.types'

/**
 * The inbound email webhook.
 *
 * The only unauthenticated *write* endpoint in the app, so the order of the middleware is
 * itself a security property: authenticate, then cap the size, then parse. An anonymous
 * caller must never be able to make us read 35 MB.
 */
export const inboundEmailRouter = Router()

const INBOUND_PATH = '/api/email/inbound'

/**
 * Constant-time credential check.
 *
 * Compares SHA-256 digests rather than the raw strings so both sides are always 32 bytes —
 * `timingSafeEqual` throws on a length mismatch, and guarding that with a length check
 * would itself leak the password's length.
 */
function secretEquals(a: string, b: string): boolean {
  const hash = (value: string) => {
    const digest = new Bun.CryptoHasher('sha256').update(value).digest()
    return Buffer.from(digest)
  }
  return timingSafeEqual(hash(a), hash(b))
}

/**
 * HTTP Basic, with the credentials living in the provider's destination URL
 * (`https://user:pass@host/api/email/inbound`).
 *
 * Chosen over a secret path segment so the secret stays out of request lines, access logs
 * and anything that forwards a URL.
 *
 * Deliberately no `WWW-Authenticate` header on the 401: nothing here should ever make a
 * browser pop a credential prompt.
 */
function webhookBasicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const [scheme, encoded] = header.split(' ')

  if (scheme?.toLowerCase() !== 'basic' || !encoded) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  const user = separator === -1 ? decoded : decoded.slice(0, separator)
  const password = separator === -1 ? '' : decoded.slice(separator + 1)

  // Both compared even when the user is already wrong, so the response time does not
  // reveal which half failed.
  const userOk = secretEquals(user, inboundWebhookUser)
  const passwordOk = secretEquals(password, inboundWebhookPassword ?? '')

  if (!userOk || !passwordOk) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}

/**
 * Hard byte cap on the request.
 *
 * Express applies no size limit to a content type no parser claims, so without this the
 * endpoint would accept a body of any size. Counted on the raw stream and enforced before
 * busboy sees anything.
 */
function limitRequestSize(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.header('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.status(413).json({ error: 'Too large' })
      return
    }

    let seen = 0
    req.on('data', (chunk: Buffer) => {
      seen += chunk.length
      if (seen > maxBytes) {
        // A sender that lies about content-length still gets cut off mid-stream.
        res.status(413).json({ error: 'Too large' })
        req.destroy()
      }
    })

    next()
  }
}

type ParsedMultipart = { fields: SendGridInboundFields; attachments: InboundAttachment[] }

/**
 * Parses the multipart body, **discarding every file part while counting its bytes**.
 *
 * `stream.resume()` on each file is mandatory, not an optimisation: an undrained file
 * stream stalls busboy, the request hangs until the provider times out, and the provider
 * then retries — turning one large email into an indefinite loop. Draining is also what
 * keeps a 30 MB attachment at O(1) memory, since attachment storage is blocked on R2 and
 * we have nowhere to put the bytes anyway.
 */
function parseMultipart(req: Request, maxBytes: number): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: SendGridInboundFields = {}
    const attachments: InboundAttachment[] = []

    const bb = busboy({
      headers: req.headers,
      limits: {
        fieldNameSize: 200,
        fieldSize: 2_000_000,
        fields: 60,
        files: 25,
        fileSize: maxBytes,
        parts: 90,
      },
    })

    bb.on('field', (name, value) => {
      fields[name] = value
    })

    bb.on('file', (_name, stream, info) => {
      let bytes = 0
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length
      })
      stream.on('end', () => {
        attachments.push({
          filename: info.filename || 'attachment',
          contentType: info.mimeType || 'application/octet-stream',
          bytes,
        })
      })
      // Discard. See the note above — this must happen for every file part.
      stream.resume()
    })

    bb.on('close', () => resolve({ fields, attachments }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

/**
 * Status contract, and why each one is what it is.
 *
 * A provider retries on any non-2xx — SendGrid for up to 72 hours — so the status is a
 * semantic decision, not decoration:
 *
 *   - `200 created|appended|duplicate|ignored` — we are done with this message, never
 *     send it again. **Every drop reason collapses to `ignored`** so the endpoint cannot
 *     be used to probe which workspaces or members exist.
 *   - `401` / `413` / `415` — the caller's fault and retrying will not help.
 *   - `503` — genuinely transient (the database is down); please do retry.
 *
 * This handler must therefore **never call `next(err)`**: the app's generic error handler
 * maps anything without a status to 500, which the provider would read as "retry for three
 * days".
 */
inboundEmailRouter.post(
  INBOUND_PATH,
  webhookBasicAuth,
  limitRequestSize(inboundMaxBytes),
  async (req: Request, res: Response) => {
    if (!req.is('multipart/form-data')) {
      res.status(415).json({ error: 'Unsupported content type' })
      return
    }

    let parsed: ParsedMultipart
    try {
      parsed = await parseMultipart(req, inboundMaxBytes)
    } catch (err) {
      console.error('[email] could not parse inbound multipart body:', err)
      res.status(400).json({ error: 'Malformed body' })
      return
    }

    try {
      const email = toInboundEmail(parsed.fields, parsed.attachments)
      const outcome = await ingestInboundEmail(email)

      res.status(200).json(
        outcome.status === 'dropped'
          ? { status: 'ignored' }
          : outcome.status === 'created'
            ? { status: 'created', number: outcome.number }
            : { status: outcome.status },
      )
    } catch (err) {
      // Reaching here means something we cannot classify — most plausibly the database.
      // 503 asks for a retry, which is right for a transient fault and harmless otherwise.
      console.error('[email] inbound ingest failed:', err)
      res.status(503).json({ error: 'Temporarily unavailable' })
    }
  },
)

export { inboundEmailEnabled, INBOUND_PATH }
