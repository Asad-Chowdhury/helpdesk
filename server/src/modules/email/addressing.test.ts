import { describe, expect, test } from 'bun:test'
import {
  inboundAddressFor,
  isReplyToken,
  newReplyToken,
  parseRecipient,
  pickRecipient,
  replyAddressFor,
} from './addressing'

const DOMAINS = ['tickets.example.com']

describe('newReplyToken', () => {
  test('is 32 lowercase hex characters — the same shape the migration backfilled', () => {
    for (let i = 0; i < 50; i++) expect(newReplyToken()).toMatch(/^[a-f0-9]{32}$/)
  })

  test('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, newReplyToken))
    expect(tokens.size).toBe(500)
  })
})

describe('address generation', () => {
  test('reply address fits RFC 5321’s 64-octet local part', () => {
    const local = replyAddressFor(newReplyToken(), 'x.com').split('@')[0]!
    expect(local.length).toBe(38)
    expect(local.length).toBeLessThanOrEqual(64)
  })

  test('a maximum-length slug address also fits', () => {
    // slugify() caps at 48. This is why the reply prefix is `reply`, not the slug:
    // 48 + 1 + 32 = 81 would overflow.
    const local = inboundAddressFor('a'.repeat(48), 'x.com').split('@')[0]!
    expect(local.length).toBeLessThanOrEqual(64)
  })

  test('round-trips through the parser', () => {
    const token = newReplyToken()
    expect(parseRecipient(replyAddressFor(token, DOMAINS[0]!), DOMAINS)).toEqual({
      kind: 'reply',
      token,
    })
    expect(parseRecipient(inboundAddressFor('acme', DOMAINS[0]!), DOMAINS)).toEqual({
      kind: 'workspace',
      slug: 'acme',
    })
  })
})

describe('parseRecipient', () => {
  const token = 'a'.repeat(32)

  test('recognises a reply address', () => {
    expect(parseRecipient(`reply+${token}@tickets.example.com`, DOMAINS)).toEqual({
      kind: 'reply',
      token,
    })
  })

  test('is case-insensitive — MTAs do not preserve local-part case', () => {
    expect(parseRecipient(`REPLY+${'A'.repeat(32)}@Tickets.Example.COM`, DOMAINS)).toEqual({
      kind: 'reply',
      token,
    })
    expect(parseRecipient('ACME@TICKETS.EXAMPLE.COM', DOMAINS)).toEqual({
      kind: 'workspace',
      slug: 'acme',
    })
  })

  test('rejects a foreign domain even when the local part looks like ours', () => {
    expect(parseRecipient(`reply+${token}@evil.example`, DOMAINS)).toEqual({ kind: 'unknown' })
    expect(parseRecipient('acme@evil.example', DOMAINS)).toEqual({ kind: 'unknown' })
  })

  test('rejects a malformed token rather than guessing', () => {
    expect(parseRecipient('reply+short@tickets.example.com', DOMAINS).kind).toBe('unknown')
    expect(parseRecipient(`reply+${'z'.repeat(32)}@tickets.example.com`, DOMAINS).kind).toBe('unknown')
    expect(parseRecipient(`reply+${token}extra@tickets.example.com`, DOMAINS).kind).toBe('unknown')
  })

  test('does not strip foreign sub-addressing down to a slug', () => {
    // `acme+anything@` must not silently become workspace `acme` — only our own
    // `reply+<token>` shape is special.
    expect(parseRecipient('acme+something@tickets.example.com', DOMAINS).kind).toBe('unknown')
  })

  test('rejects local parts that are not slug-shaped', () => {
    for (const local of ['-acme', 'acme-', 'ACME_CO', 'a..b', '']) {
      expect(parseRecipient(`${local}@tickets.example.com`, DOMAINS).kind).toBe('unknown')
    }
  })

  test('handles a missing or leading @', () => {
    expect(parseRecipient('nonsense', DOMAINS).kind).toBe('unknown')
    expect(parseRecipient('@tickets.example.com', DOMAINS).kind).toBe('unknown')
  })

  test('supports multiple configured domains', () => {
    const many = ['a.example', 'b.example']
    expect(parseRecipient('acme@b.example', many)).toEqual({ kind: 'workspace', slug: 'acme' })
  })
})

describe('pickRecipient', () => {
  const token = 'b'.repeat(32)

  test('prefers a reply over a new-ticket address', () => {
    // Someone replies to a thread and CCs the intake address. Threading onto the existing
    // ticket is right; opening a duplicate is not.
    const picked = pickRecipient(
      ['acme@tickets.example.com', `reply+${token}@tickets.example.com`],
      DOMAINS,
    )
    expect(picked?.parsed).toEqual({ kind: 'reply', token })
  })

  test('falls back to the workspace address', () => {
    const picked = pickRecipient(['someone@elsewhere.test', 'acme@tickets.example.com'], DOMAINS)
    expect(picked?.parsed).toEqual({ kind: 'workspace', slug: 'acme' })
  })

  test('returns null when nothing is ours', () => {
    expect(pickRecipient(['a@elsewhere.test'], DOMAINS)).toBeNull()
    expect(pickRecipient([], DOMAINS)).toBeNull()
  })

  test('lowercases the address it reports back', () => {
    expect(pickRecipient(['ACME@Tickets.Example.com'], DOMAINS)?.address).toBe(
      'acme@tickets.example.com',
    )
  })
})

describe('isReplyToken', () => {
  test('accepts what newReplyToken produces and rejects near-misses', () => {
    expect(isReplyToken(newReplyToken())).toBe(true)
    expect(isReplyToken('A'.repeat(32))).toBe(false) // uppercase
    expect(isReplyToken('a'.repeat(31))).toBe(false)
  })
})
