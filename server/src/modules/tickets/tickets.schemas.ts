import { z } from 'zod'
import { TicketPriority, TicketStatus } from '../../generated/prisma/enums'

/**
 * Request shapes for the ticket routes. Mirrored on the client in
 * `client/src/lib/schemas.ts` — the client copy is for fast feedback, these are the
 * authority.
 *
 * The enums come from the Prisma-generated const objects via `z.enum`, so adding a
 * status or priority to the schema needs no second list here.
 */

const statusField = z.enum(TicketStatus, { error: 'Choose a valid status' })
const priorityField = z.enum(TicketPriority, { error: 'Choose a valid priority' })

const subjectField = z
  .string({ error: 'Subject is required' })
  .trim()
  .min(1, { error: 'Subject is required' })
  .max(200, { error: 'Subject is too long' })

const descriptionField = z
  .string({ error: 'Description is required' })
  .trim()
  .min(1, { error: 'Description is required' })
  .max(10_000, { error: 'Description is too long' })

/**
 * Ids arrive as opaque strings — cuids today, but nothing here depends on that. They are
 * only ever used inside a workspace-scoped `where`, so a malformed one is a 404, not an
 * injection risk. The length cap just stops a multi-megabyte string reaching the query.
 */
const idField = z
  .string({ error: 'Expected an id' })
  .trim()
  .min(1, { error: 'Expected an id' })
  .max(64, { error: 'That id is not valid' })

/**
 * `null` is meaningful and distinct from absent on the nullable fields below: absent
 * means "leave it alone", null means "clear it". `.nullish()` accepts both and the
 * service tells them apart with an `undefined` check.
 */
export const createTicketSchema = z.object({
  subject: subjectField,
  description: descriptionField,
  categoryId: idField.nullish(),
  assigneeId: idField.nullish(),
  // Priority is accepted at creation but only honoured for an Admin — the policy module
  // decides, because "who may set this" is authorization, not shape.
  priority: priorityField.optional(),
})

export const updateTicketSchema = z
  .object({
    subject: subjectField.optional(),
    description: descriptionField.optional(),
    status: statusField.optional(),
    priority: priorityField.optional(),
    categoryId: idField.nullish(),
    assigneeId: idField.nullish(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Nothing to update',
  })

export const createCommentSchema = z.object({
  body: z
    .string({ error: 'Comment is required' })
    .trim()
    .min(1, { error: 'Comment is required' })
    .max(10_000, { error: 'Comment is too long' }),
  internal: z.boolean({ error: 'Internal must be true or false' }).optional(),
})

/**
 * List filters, parsed from the query string rather than a body.
 *
 * Everything is a string on the way in, so numbers are coerced. `status` and `priority`
 * accept repeats (`?status=OPEN&status=RESOLVED`), which Express surfaces as an array for
 * two-or-more and a bare string for one — `preprocess` flattens both to an array so the
 * service always sees the same shape.
 */
const repeatable = <T extends z.ZodType>(inner: T) =>
  z.preprocess(
    (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
    z
      .array(inner)
      .min(1, { error: 'Choose at least one value' })
      .max(20, { error: 'Too many values' })
      .optional(),
  )

/**
 * Every message here is written for an API client, not lifted from zod's defaults. A raw
 * zod message ("Too big: expected number to be <=100") describes the schema rather than
 * the request, and the `{ error, fields? }` envelope is supposed to read the same across
 * every endpoint — see the note at the top of lib/validation.ts.
 */
export const listTicketsQuerySchema = z.object({
  status: repeatable(statusField),
  priority: repeatable(priorityField),
  categoryId: idField.optional(),
  /**
   * A membership-independent user id, or the literal 'unassigned' to find tickets with no
   * assignee at all — which a plain id filter cannot express.
   */
  assigneeId: z.union([idField, z.literal('unassigned')]).optional(),
  /** Free-text over subject and description. */
  q: z.string().trim().max(200, { error: 'Search term is too long' }).optional(),
  sort: z
    .enum(['newest', 'oldest', 'priority', 'updated'], { error: 'Choose a valid sort' })
    .optional()
    .default('newest'),
  page: z.coerce
    .number({ error: 'Page must be a number' })
    .int({ error: 'Page must be a whole number' })
    .min(1, { error: 'Page must be at least 1' })
    .max(10_000, { error: 'Page is out of range' })
    .optional()
    .default(1),
  perPage: z.coerce
    .number({ error: 'Page size must be a number' })
    .int({ error: 'Page size must be a whole number' })
    .min(1, { error: 'Page size must be at least 1' })
    .max(100, { error: 'Page size must be 100 or fewer' })
    .optional()
    .default(25),
})

export type CreateTicketBody = z.infer<typeof createTicketSchema>
export type UpdateTicketBody = z.infer<typeof updateTicketSchema>
export type CreateCommentBody = z.infer<typeof createCommentSchema>
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>
