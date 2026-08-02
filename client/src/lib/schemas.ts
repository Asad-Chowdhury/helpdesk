import { z } from 'zod'

/**
 * Mirrors the server's rules in server/src/routes/signup.ts. The server stays the
 * authority — these exist to catch mistakes without a round trip, and any field error
 * the API returns still overrides what's here.
 */
export const MIN_PASSWORD_LENGTH = 8

export const signupSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, { error: 'Workspace name is required' })
    .max(100, { error: 'Workspace name is too long' }),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Your name is required' })
    .max(100, { error: 'Name is too long' }),
  email: z
    .email({ error: 'Enter a valid email address' })
    .max(254, { error: 'Email is too long' }),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    })
    .max(128, { error: 'Password is too long' }),
})

export type SignupValues = z.infer<typeof signupSchema>

/**
 * Login intentionally does not re-check password length — an old account may predate
 * a policy change, and the server decides. Only presence is checked here.
 */
export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
  password: z.string().min(1, { error: 'Password is required' }),
})

export type LoginValues = z.infer<typeof loginSchema>

/**
 * Mirrors server/src/routes/workspace-members.ts. No password field — the server issues
 * a temporary one, because there is no transactional email to send an invite through yet.
 */
export const addMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name is too long' }),
  email: z
    .email({ error: 'Enter a valid email address' })
    .max(254, { error: 'Email is too long' }),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CLIENT'], { error: 'Choose a role' }),
})

export type AddMemberValues = z.infer<typeof addMemberSchema>

/**
 * Profile details. Mirrors `updateProfileSchema` in
 * `server/src/modules/users/users.schemas.ts` — same fields, same messages.
 */
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Your name is required' })
    .max(100, { error: 'Name is too long' }),
  email: z
    .email({ error: 'Enter a valid email address' })
    .max(254, { error: 'Email is too long' }),
})

export type ProfileValues = z.infer<typeof profileSchema>

/**
 * Password change. The current password is required because Better Auth's
 * /change-password verifies it server-side — asking for it here is not the check, just
 * a way to fail before the round trip.
 *
 * `confirmPassword` exists only on this side: a typo in a new password is unrecoverable
 * without email reset, which does not exist yet. The refine is attached to the confirm
 * field via `path` so the message lands on the input the user must fix.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Enter your current password' }),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      })
      .max(128, { error: 'Password is too long' }),
    confirmPassword: z.string().min(1, { error: 'Confirm your new password' }),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>

/**
 * New ticket. Mirrors `createTicketSchema` in
 * `server/src/modules/tickets/tickets.schemas.ts` — same limits, same messages.
 *
 * `categoryId` and `assigneeId` use '' as the "none" value rather than undefined, because
 * a Select's empty option has to carry a string. The submit handler converts '' to null,
 * which is what the API means by "clear this".
 */
export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, { error: 'Subject is required' })
    .max(200, { error: 'Subject is too long' }),
  description: z
    .string()
    .trim()
    .min(1, { error: 'Description is required' })
    .max(10_000, { error: 'Description is too long' }),
  categoryId: z.string().optional(),
  assigneeId: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

export type CreateTicketValues = z.infer<typeof createTicketSchema>

/** Editing an existing ticket's request text and category. Same rules as creating one. */
export const editTicketSchema = createTicketSchema.pick({
  subject: true,
  description: true,
  categoryId: true,
})

export type EditTicketValues = z.infer<typeof editTicketSchema>

/**
 * A comment or an internal note — the same form, with `internal` deciding which. Mirrors
 * `createCommentSchema` on the server.
 */
export const ticketCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Write something first' })
    .max(10_000, { error: 'Comment is too long' }),
  internal: z.boolean().optional(),
})

export type TicketCommentValues = z.infer<typeof ticketCommentSchema>
