import { z } from 'zod'

/**
 * Server-side request validation. Every route parses its body through a zod schema and
 * renders failures with `validationErrorBody`, so the wire format is identical
 * everywhere: `{ error, fields? }` — the envelope `readApiError` on the client expects.
 *
 * The client mirrors these rules in `client/src/lib/schemas.ts` for fast feedback, but
 * the server stays the authority: a caller hitting the API directly skips the form
 * entirely, so nothing here may be relaxed on the assumption the client checked first.
 */

export type FieldErrors = Record<string, string>

/**
 * One message per field — the first issue reported for it.
 *
 * The client renders these straight onto inputs via `setError`, and an input can only
 * show one message, so later issues on the same field are dropped rather than joined.
 */
function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {}

  for (const issue of error.issues) {
    if (issue.path.length === 0) continue // object-level, handled below
    const key = issue.path.map(String).join('.')
    if (fields[key] === undefined) fields[key] = issue.message
  }

  return fields
}

/**
 * Turns a ZodError into the 400 response body.
 *
 * Field issues win over object-level ones. A schema-level `.refine` (like "Nothing to
 * update") produces an issue with an empty path, and zod may report it *alongside* a
 * bad field rather than instead of it — preferring fields here keeps the response
 * deterministic either way, and means the caller always gets the specific problem
 * rather than the generic one.
 */
export function validationErrorBody(error: z.ZodError): { error: string; fields?: FieldErrors } {
  const fields = fieldErrorsFrom(error)

  if (Object.keys(fields).length > 0) {
    return { error: 'Validation failed', fields }
  }

  const rootIssue = error.issues.find((issue) => issue.path.length === 0)
  return { error: rootIssue?.message ?? 'Validation failed' }
}

/**
 * Parses a request body against `schema`, reporting failures in our own envelope.
 *
 * The body is normalised to `{}` unless it is a plain object first. `express.json()`
 * hands through whatever valid JSON arrived, so a caller can post `null`, `"hi"` or an
 * array — and parsing those against an object schema yields zod's own
 * "expected object, received null", a message written for a developer reading a stack
 * trace rather than for an API client. Treating them as an empty object instead reports
 * the fields that are actually missing, which is both more useful and the behaviour the
 * hand-rolled validators had.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown) {
  const normalised =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}

  return schema.safeParse(normalised)
}

/**
 * Field schemas shared by more than one route, so signup and "add member" cannot drift
 * apart on what counts as a valid person.
 *
 * Both trim first: the values are stored and compared as-is, and a trailing space in an
 * email would otherwise create a second account for the same address.
 */
export const personNameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(1, { error: 'Name is required' })
  .max(100, { error: 'Name is too long' })

/**
 * Length is checked before the format so a very long value reports "too long" rather
 * than a confusing "invalid address". 254 is the practical maximum for an address.
 */
export const emailField = z
  .string({ error: 'Email is required' })
  .trim()
  .max(254, { error: 'Email is too long' })
  .pipe(z.email({ error: 'Enter a valid email address' }))
