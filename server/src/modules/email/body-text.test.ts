import { describe, expect, test } from 'bun:test'
import { bodyTextFrom, htmlToText, stripQuotedReply } from './body-text'

describe('htmlToText', () => {
  test('turns block elements into line breaks', () => {
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One\nTwo')
    expect(htmlToText('Line<br>Break')).toBe('Line\nBreak')
  })

  test('drops script and style content entirely', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Visible</p>')).toBe('Visible')
    expect(htmlToText('<script>alert(1)</script>Safe')).toBe('Safe')
  })

  test('decodes the entities that actually appear, ampersand last', () => {
    expect(htmlToText('&lt;b&gt; &amp; &quot;q&quot; &#39;s&#39;&nbsp;end')).toBe(
      '<b> & "q" \'s\' end',
    )
    // If &amp; were decoded first, &amp;lt; would wrongly become "<".
    expect(htmlToText('&amp;lt;')).toBe('&lt;')
  })

  test('collapses runaway blank lines', () => {
    expect(htmlToText('<p>a</p><p></p><p></p><p></p><p>b</p>')).toBe('a\n\nb')
  })

  test('marks list items', () => {
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>')).toBe('• one\n• two')
  })
})

describe('stripQuotedReply', () => {
  test('cuts at the Gmail/Apple "On … wrote:" marker', () => {
    const body = [
      'Any update on this?',
      '',
      'On Mon, 1 Jan 2026 at 10:00, Support <s@x.com> wrote:',
      '> We are looking into it.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('Any update on this?')
  })

  test('cuts at the Outlook original-message marker', () => {
    const body = 'Thanks!\n\n-----Original Message-----\nFrom: Support\nold stuff'
    expect(stripQuotedReply(body)).toBe('Thanks!')
  })

  test('cuts at the Outlook rule and quoted header block', () => {
    expect(stripQuotedReply('Reply text\n\n________________________________\nquoted')).toBe(
      'Reply text',
    )
    expect(stripQuotedReply('Reply text\n\nFrom: Someone\nSent: Monday\nquoted')).toBe('Reply text')
  })

  test('drops a trailing quote block that has no marker', () => {
    expect(stripQuotedReply('New comment\n\n> old line\n> another')).toBe('New comment')
  })

  test('keeps inline quoting above a marker — that is deliberate answering', () => {
    const body = '> Did you try X?\nYes, no luck.\n\nOn Mon someone wrote:\n> everything'
    expect(stripQuotedReply(body)).toBe('> Did you try X?\nYes, no luck.')
  })

  test('returns the original when stripping would leave nothing', () => {
    // Better a noisy comment than an empty one.
    const onlyQuote = '> just a quote\n> and more'
    expect(stripQuotedReply(onlyQuote)).toBe(onlyQuote)
  })

  test('leaves an ordinary message untouched', () => {
    expect(stripQuotedReply('Just a normal message.')).toBe('Just a normal message.')
  })
})

describe('bodyTextFrom', () => {
  test('prefers plain text over HTML', () => {
    expect(
      bodyTextFrom({ text: 'plain wins', html: '<p>html loses</p>', stripQuoted: false }),
    ).toBe('plain wins')
  })

  test('falls back to converted HTML when there is no text part', () => {
    expect(bodyTextFrom({ text: null, html: '<p>only html</p>', stripQuoted: false })).toBe(
      'only html',
    )
    expect(bodyTextFrom({ text: '   ', html: '<p>only html</p>', stripQuoted: false })).toBe(
      'only html',
    )
  })

  test('strips quoting only when asked — a new ticket has nothing to strip', () => {
    const body = 'Reply\n\n> quoted'
    expect(bodyTextFrom({ text: body, html: null, stripQuoted: true })).toBe('Reply')
    expect(bodyTextFrom({ text: body, html: null, stripQuoted: false })).toBe(body)
  })

  test('returns an empty string when there is no body at all', () => {
    expect(bodyTextFrom({ text: null, html: null, stripQuoted: true })).toBe('')
    expect(bodyTextFrom({ text: '', html: '', stripQuoted: true })).toBe('')
  })
})
