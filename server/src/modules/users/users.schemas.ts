import { z } from 'zod'
import { Role } from '../../generated/prisma/enums'
import { emailField, personNameField } from '../../lib/validation'

/**
 * Request schemas for the workspace-users routes. Mirrored client-side in
 * `client/src/lib/schemas.ts` — keep the messages identical, since those are what the
 * form shows when the server rejects a submission.
 */

// Prisma generates Role as a const object, so this stays correct if a role is added to
// the schema — no hand-maintained list to fall out of sync.
const roleField = z.enum(Role, { error: 'Choose a valid role' })

/**
 * `addMember` is not an invite yet: with no transactional email, the server issues a
 * temporary password rather than accepting one, so there is no password field here.
 */
export const addMemberSchema = z.object({
  name: personNameField,
  email: emailField,
  role: roleField,
})

export type AddMemberBody = z.infer<typeof addMemberSchema>

/**
 * A PATCH may carry either field or both, but not neither — an empty body is a caller
 * mistake, not a no-op, so it is rejected rather than silently returning the member
 * unchanged. The refine has no `path`, which makes it an object-level issue that
 * `validationErrorBody` renders as a plain `{ error }` with no field attached.
 */
export const updateMemberSchema = z
  .object({
    role: roleField.optional(),
    active: z.boolean({ error: 'Active must be true or false' }).optional(),
  })
  .refine((body) => body.role !== undefined || body.active !== undefined, {
    error: 'Nothing to update',
  })

export type UpdateMemberBody = z.infer<typeof updateMemberSchema>

/**
 * The signed-in user editing their own profile (PATCH /api/me).
 *
 * Both fields are required rather than optional: the profile form always submits the
 * whole thing, and a partial update would make "cleared the field" indistinguishable
 * from "left it alone". Role is deliberately absent — it lives on Membership and is an
 * admin's decision, so it must not be self-assignable from this endpoint.
 */
export const updateProfileSchema = z.object({
  name: personNameField,
  email: emailField,
})

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
