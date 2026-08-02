import { describe, expect, test } from 'bun:test'
import {
  isAutomatedMessage,
  messageIdsFrom,
  normaliseMessageId,
  parseHeaderBlock,
} from './mime-headers'

describe('parseHeaderBlock', () => {
  test('lowercases names and keeps values', () => {
    expect(parseHeaderBlock('Subject: Hello\r\nMessage-ID: <abc@x>')).toEqual({
      subject: 'Hello',
      'message-id': '<abc@x>',
    })
  })

  test('unfolds continuation lines — a References chain always wraps', () => {
    const raw = 'References: <a@x>\r\n <b@x>\r\n\t<c@x>\r\nSubject: Re: hi'
    const headers = parseHeaderBlock(raw)
    expect(headers['references']).toBe('<a@x> <b@x> <c@x>')
    // The Subject must survive as its own header, not be swallowed by the fold.
    expect(headers['subject']).toBe('Re: hi')
  })

  test('keeps the FIRST of a repeated header', () => {
    // Headers accumulate as a message is relayed, so the earliest is closest to the sender.
    expect(parseHeaderBlock('Received: one\r\nReceived: two')['received']).toBe('one')
  })

  test('tolerates junk without throwing', () => {
    expect(parseHeaderBlock('')).toEqual({})
    expect(parseHeaderBlock('no colon here')).toEqual({})
    expect(parseHeaderBlock(': empty name')).toEqual({})
  })

  test('handles a value containing colons', () => {
    expect(parseHeaderBlock('Date: Mon, 1 Jan 2026 10:30:00 +0000')['date']).toBe(
      'Mon, 1 Jan 2026 10:30:00 +0000',
    )
  })

  test('accepts LF-only line endings', () => {
    expect(parseHeaderBlock('Subject: a\nFrom: b')).toEqual({ subject: 'a', from: 'b' })
  })
})

describe('normaliseMessageId', () => {
  test('strips angle brackets and lowercases', () => {
    expect(normaliseMessageId('<AbC@Example.COM>')).toBe('abc@example.com')
  })

  test('returns null for absent or empty', () => {
    expect(normaliseMessageId(undefined)).toBeNull()
    expect(normaliseMessageId(null)).toBeNull()
    expect(normaliseMessageId('   ')).toBeNull()
    expect(normaliseMessageId('<>')).toBeNull()
  })
})

describe('messageIdsFrom', () => {
  test('extracts a whole chain in order', () => {
    expect(messageIdsFrom('<a@x> <b@x> <c@x>')).toEqual(['a@x', 'b@x', 'c@x'])
  })

  test('ignores anything not in angle brackets', () => {
    expect(messageIdsFrom('commentary <a@x> more words')).toEqual(['a@x'])
    expect(messageIdsFrom('bare@id')).toEqual([])
  })

  test('returns an empty array rather than null', () => {
    expect(messageIdsFrom(undefined)).toEqual([])
    expect(messageIdsFrom('')).toEqual([])
  })
})

describe('isAutomatedMessage', () => {
  test('detects Auto-Submitted per RFC 3834', () => {
    expect(isAutomatedMessage({ 'auto-submitted': 'auto-replied' })).toBe(true)
    expect(isAutomatedMessage({ 'auto-submitted': 'auto-generated' })).toBe(true)
    // "no" is the explicit signal that a human sent it.
    expect(isAutomatedMessage({ 'auto-submitted': 'no' })).toBe(false)
  })

  test('detects the X-Auto* headers clients actually send', () => {
    expect(isAutomatedMessage({ 'x-autoreply': 'yes' })).toBe(true)
    expect(isAutomatedMessage({ 'x-autorespond': 'yes' })).toBe(true)
  })

  test('detects bulk and list traffic', () => {
    expect(isAutomatedMessage({ precedence: 'bulk' })).toBe(true)
    expect(isAutomatedMessage({ precedence: 'auto_reply' })).toBe(true)
    expect(isAutomatedMessage({ 'list-id': '<list.example.com>' })).toBe(true)
    expect(isAutomatedMessage({ 'list-unsubscribe': '<mailto:x@y>' })).toBe(true)
  })

  test('leaves ordinary mail alone', () => {
    expect(isAutomatedMessage({})).toBe(false)
    expect(isAutomatedMessage({ subject: 'Help please', from: 'a@b' })).toBe(false)
    expect(isAutomatedMessage({ precedence: 'normal' })).toBe(false)
  })
})
