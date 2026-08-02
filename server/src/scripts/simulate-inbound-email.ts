/**
 * Sends your running server the exact payload SendGrid's Inbound Parse would POST, so the
 * whole email-to-ticket path can be exercised with no domain, no DNS and no SendGrid
 * account.
 *
 * What this genuinely proves: routing, sender authorisation, dedupe, threading, body
 * handling and the attachment manifest — everything from the webhook inwards.
 *
 * What it cannot prove, and nothing local can: that a real MTA routes to the provider,
 * that SPF/DKIM behave, that the provider's real field names match these fixtures, or that
 * a 30 MB body survives a production proxy.
 *
 * Usage (see `bun run email:simulate -- --help`).
 */

import { parseArgs } from 'node:util'
import { prisma } from '../lib/prisma'
import { inboundAddressFor, replyAddressFor } from '../modules/email/addressing'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    to: { type: 'string' },
    from: { type: 'string' },
    subject: { type: 'string' },
    body: { type: 'string' },
    'reply-to-ticket': { type: 'string' },
    'message-id': { type: 'string' },
    attach: { type: 'string', multiple: true },
    url: { type: 'string' },
    user: { type: 'string' },
    password: { type: 'string' },
    domain: { type: 'string' },
    list: { type: 'boolean' },
    help: { type: 'boolean' },
  },
  allowPositionals: true,
})

const API = values.url ?? 'http://localhost:3000'
const DOMAIN = values.domain ?? process.env.MAIL_DOMAIN?.split(',')[0]?.trim() ?? ''
const USER = values.user ?? process.env.INBOUND_WEBHOOK_USER ?? 'inbound'
const PASSWORD = values.password ?? process.env.INBOUND_WEBHOOK_PASSWORD ?? ''

if (values.help) {
  console.log(`
Simulate an inbound email.

  --list                       Show the addresses and senders available in your database
  --from <email>               Sender. Must be an active member (known-senders-only)
  --to <address>               Recipient. Defaults to the first workspace's intake address
  --subject <text>
  --body <text>
  --reply-to-ticket <number>   Reply to ticket #N instead of raising a new one
  --attach <name:type:bytes>   Add a fake attachment part, repeatable
  --message-id <id>            Reuse one to simulate a provider retry
  --url <base>                 API base (default http://localhost:3000)
  --domain <host>              MAIL_DOMAIN to use (default: from env)

Examples
  bun run email:simulate -- --list
  bun run email:simulate -- --from clicksncrumbs@gmail.com --subject "Need new menu photos"
  bun run email:simulate -- --from clicksncrumbs@gmail.com --reply-to-ticket 1 --body "Any update?"
`)
  process.exit(0)
}

if (values.list) {
  const workspaces = await prisma.workspace.findMany({
    select: { name: true, slug: true, allowUnknownSenders: true },
  })
  console.log('\nIntake addresses:')
  for (const w of workspaces) {
    const address = DOMAIN ? inboundAddressFor(w.slug, DOMAIN) : `${w.slug}@<MAIL_DOMAIN not set>`
    console.log(`  ${address.padEnd(44)} → "${w.name}"`)
  }

  const members = await prisma.membership.findMany({
    where: { deactivatedAt: null },
    select: { role: true, user: { select: { email: true } }, workspace: { select: { slug: true } } },
  })
  console.log('\nSenders that will be accepted (active members only):')
  for (const m of members) {
    console.log(`  ${m.user.email.padEnd(30)} ${m.role.padEnd(8)} → ${m.workspace.slug}`)
  }

  const tickets = await prisma.ticket.findMany({
    select: { number: true, subject: true, source: true, replyToken: true, workspace: { select: { slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  if (tickets.length > 0) {
    console.log('\nRecent tickets and their reply addresses:')
    for (const t of tickets) {
      const address = DOMAIN ? replyAddressFor(t.replyToken, DOMAIN) : '(MAIL_DOMAIN not set)'
      console.log(`  #${String(t.number).padEnd(4)} [${t.source}] ${t.subject.slice(0, 34).padEnd(36)} ${address}`)
    }
  }
  console.log()
  await prisma.$disconnect()
  process.exit(0)
}

if (!DOMAIN) {
  console.error('MAIL_DOMAIN is not set. Pass --domain, or set it in server/.env')
  process.exit(1)
}
if (!values.from) {
  console.error('--from is required. Run with --list to see accepted senders.')
  process.exit(1)
}

// Work out the recipient: an explicit --to, a reply address for --reply-to-ticket, or the
// first workspace's intake address.
let to = values.to
if (!to && values['reply-to-ticket']) {
  const number = Number(values['reply-to-ticket'])
  const ticket = await prisma.ticket.findFirst({
    where: { number },
    select: { replyToken: true, subject: true },
  })
  if (!ticket) {
    console.error(`No ticket #${number}. Run with --list to see what exists.`)
    process.exit(1)
  }
  to = replyAddressFor(ticket.replyToken, DOMAIN)
  values.subject ??= `Re: ${ticket.subject}`
}
if (!to) {
  const workspace = await prisma.workspace.findFirst({ select: { slug: true } })
  if (!workspace) {
    console.error('No workspaces exist. Sign up first.')
    process.exit(1)
  }
  to = inboundAddressFor(workspace.slug, DOMAIN)
}

const subject = values.subject ?? 'Test request from the simulator'
const body = values.body ?? 'This message was produced by scripts/simulate-inbound-email.ts.'
const messageId = values['message-id'] ?? `sim-${Date.now()}-${Math.random().toString(36).slice(2)}@simulator.test`

const headers = [
  `Message-ID: <${messageId}>`,
  `Date: ${new Date().toUTCString()}`,
  `Subject: ${subject}`,
  `From: ${values.from}`,
  `To: ${to}`,
].join('\r\n')

// Exactly the field set SendGrid posts in parsed (non-raw) mode.
const form = new FormData()
form.set('headers', headers)
form.set('to', to)
form.set('from', values.from)
form.set('subject', subject)
form.set('text', body)
form.set('envelope', JSON.stringify({ to: [to], from: values.from }))
form.set('SPF', 'pass')
form.set('dkim', `{@${values.from.split('@')[1]} : pass}`)
form.set('spam_score', '0.1')

for (const spec of values.attach ?? []) {
  const [filename = 'file.bin', type = 'application/octet-stream', size = '1024'] = spec.split(':')
  const bytes = new Uint8Array(Number(size))
  form.append('attachment1', new Blob([bytes], { type }), filename)
}

console.log(`\n  from: ${values.from}`)
console.log(`    to: ${to}`)
console.log(`  subj: ${subject}`)

const response = await fetch(`${API}/api/email/inbound`, {
  method: 'POST',
  headers: { authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}` },
  body: form,
})

const text = await response.text()
console.log(`\n  → ${response.status} ${text}\n`)

if (response.status === 200) {
  const parsed = JSON.parse(text) as { status: string; number?: number }
  if (parsed.status === 'created') console.log(`  Ticket #${parsed.number} created. Open http://localhost:5173/tickets\n`)
  if (parsed.status === 'appended') console.log('  Comment appended to the existing ticket.\n')
  if (parsed.status === 'duplicate') console.log('  Ignored as a duplicate — the dedupe key had been seen before.\n')
  if (parsed.status === 'ignored') {
    const last = await prisma.inboundEmail.findFirst({
      orderBy: { receivedAt: 'desc' },
      select: { dropReason: true },
    })
    console.log(`  Dropped. Reason recorded on inbound_email: ${last?.dropReason ?? 'unknown'}\n`)
  }
}

await prisma.$disconnect()
