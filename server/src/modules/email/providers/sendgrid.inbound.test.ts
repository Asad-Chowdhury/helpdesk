import { describe, expect, test } from 'bun:test'
import { parseAddress, toInboundEmail, type SendGridInboundFields } from './sendgrid.inbound'
import { isAutomatedMessage } from '../mime-headers'
import { bodyTextFrom } from '../body-text'
import { pickRecipient } from '../addressing'

import newTicket from '../__fixtures__/new-ticket.json'
import replyWithToken from '../__fixtures__/reply-with-token.json'
import htmlOnly from '../__fixtures__/html-only-with-attachments.json'
import autoReply from '../__fixtures__/auto-reply-no-messageid.json'

const DOMAINS = ['tickets.example.com']
const f = (json: unknown) => json as SendGridInboundFields

describe('parseAddress', () => {
  test('splits display name from address and lowercases the address', () => {
    expect(parseAddress('Sam Staff <Sam@Acme.TEST>')).toEqual({
      email: 'sam@acme.test',
      name: 'Sam Staff',
    })
  })

  test('handles a bare address', () => {
    expect(parseAddress('sam@acme.test')).toEqual({ email: 'sam@acme.test' })
  })

  test('unwraps a quoted display name', () => {
    expect(parseAddress('"Mia Manager" <mia@acme.test>')).toEqual({
      email: 'mia@acme.test',
      name: 'Mia Manager',
    })
  })

  test('takes only the first of several — a message has one requester', () => {
    expect(parseAddress('a@x.test, b@y.test').email).toBe('a@x.test')
  })

  test('does not throw on empty input', () => {
    expect(parseAddress(undefined)).toEqual({ email: '' })
  })
})

describe('toInboundEmail — new ticket fixture', () => {
  const email = toInboundEmail(f(newTicket))

  test('routes on the envelope, not the To header', () => {
    expect(email.envelopeTo).toEqual(['acme@tickets.example.com'])
    expect(email.envelopeFrom).toBe('sam@acme.test')
    expect(pickRecipient(email.envelopeTo, DOMAINS)?.parsed).toEqual({
      kind: 'workspace',
      slug: 'acme',
    })
  })

  test('extracts sender, subject and body', () => {
    expect(email.from).toEqual({ email: 'sam@acme.test', name: 'Sam Staff' })
    expect(email.subject).toBe('Launch deck needs the new logo')
    expect(email.text).toContain('slides 3 and 7')
  })

  test('normalises the Message-ID for dedupe', () => {
    expect(email.messageId).toBe('caf1e2new@mail.gmail.com')
  })

  test('carries authentication results — without these, From is forgeable', () => {
    expect(email.auth.spf).toBe('pass')
    expect(email.auth.dkim).toBe(true)
    expect(email.spamScore).toBe(0.4)
  })

  test('is not an automated message', () => {
    expect(isAutomatedMessage(email.headers)).toBe(false)
  })
})

describe('toInboundEmail — reply fixture', () => {
  const email = toInboundEmail(f(replyWithToken))

  test('the envelope recipient resolves to a reply token', () => {
    const picked = pickRecipient(email.envelopeTo, DOMAINS)
    expect(picked?.parsed).toEqual({ kind: 'reply', token: '0'.repeat(32) })
  })

  test('captures the threading headers used as the fallback match', () => {
    expect(email.inReplyTo).toBe('notify-1@tickets.example.com')
    expect(email.references).toEqual(['notify-1@tickets.example.com'])
  })

  test('quoted history is stripped from the comment body', () => {
    const body = bodyTextFrom({ text: email.text, html: email.html, stripQuoted: true })
    expect(body).toBe('Friday works, thanks.')
    expect(body).not.toContain('We have picked this up')
  })
})

describe('toInboundEmail — HTML-only with attachments', () => {
  const email = toInboundEmail(f(htmlOnly))

  test('falls back to converted HTML when there is no text part', () => {
    expect(email.text).toBe('')
    const body = bodyTextFrom({ text: email.text, html: email.html, stripQuoted: false })
    expect(body).toContain('Brief is attached.')
    expect(body).toContain('Deadline is Friday.')
  })

  test('records the attachment manifest even though the bytes are discarded', () => {
    expect(email.attachments).toEqual([
      { filename: 'brief.pdf', contentType: 'application/pdf', bytes: 0 },
      { filename: 'logo.png', contentType: 'image/png', bytes: 0 },
    ])
  })

  test('measured byte counts from the multipart layer win over the declared ones', () => {
    const measured = toInboundEmail(f(htmlOnly), [
      { filename: 'brief.pdf', contentType: 'application/pdf', bytes: 421_888 },
    ])
    expect(measured.attachments).toEqual([
      { filename: 'brief.pdf', contentType: 'application/pdf', bytes: 421_888 },
    ])
  })
})

describe('toInboundEmail — auto-reply with no Message-ID', () => {
  const email = toInboundEmail(f(autoReply))

  test('is recognised as automated, so it never becomes a ticket or a reply', () => {
    expect(isAutomatedMessage(email.headers)).toBe(true)
  })

  test('reports a null messageId so the caller synthesizes a dedupe key', () => {
    expect(email.messageId).toBeNull()
  })

  test('reports the failing SPF result rather than swallowing it', () => {
    expect(email.auth.spf).toBe('softfail')
    expect(email.auth.dkim).toBe(false)
  })
})

describe('toInboundEmail — malformed input', () => {
  test('a broken envelope JSON does not throw', () => {
    const email = toInboundEmail({ envelope: '{not json', to: 'acme@tickets.example.com' })
    // Falls back to the `to` field rather than failing the whole delivery.
    expect(email.envelopeTo).toEqual(['acme@tickets.example.com'])
    expect(email.envelopeFrom).toBeNull()
  })

  test('completely empty fields produce a usable object', () => {
    const email = toInboundEmail({})
    expect(email.subject).toBe('')
    expect(email.messageId).toBeNull()
    expect(email.attachments).toEqual([])
    expect(email.auth).toEqual({ spf: null, dkim: null })
  })

  test('a non-numeric spam score becomes null, not NaN', () => {
    expect(toInboundEmail({ spam_score: 'n/a' }).spamScore).toBeNull()
  })
})
