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
