import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { auth } from '../lib/auth'
import { rateLimitingEnabled } from '../lib/env'
import { emailField, parseBody, validationErrorBody } from '../lib/validation'
import { createWorkspaceWithAdmin, EmailTakenError } from '../services/workspace'

export const signupRouter = Router()

/**
 * Better Auth's limiter only covers /api/auth/*, so this route needs its own.
 * It is the only public endpoint that creates tenants, which makes unlimited
 * scripted workspace creation the obvious abuse.
 *
 * Generous for humans — one signup, plus room for retries after validation errors —
 * while making bulk creation impractical. Storage is in-memory, so the limit is per
 * instance until this moves to Redis.
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many signup attempts. Please try again later.' })
  },
})

/**
 * Applied in production only — dev, staging and the E2E suite pass straight through,
 * since every request there shares one address and ten signups would exhaust the
 * window without stopping any abuse. See rateLimitingEnabled in ../lib/env.
 */
const signupLimiter = (req: Request, res: Response, next: NextFunction) =>
  rateLimitingEnabled ? limiter(req, res, next) : next()

const MIN_PASSWORD_LENGTH = 8 // matches Better Auth's default
// The client schema enforces this too, but a caller hitting the API directly bypasses
// that entirely — the server has to police its own bounds.
const MAX_PASSWORD_LENGTH = 128

/**
 * Mirrored client-side in `client/src/lib/schemas.ts`. `name` is spelled out rather
 * than reusing `personNameField` because this form asks for the signer-up's own name
 * ("Your name is required"), and zod checks accumulate — appending a second `min(1)`
 * would report the shared field's message first rather than replacing it.
 *
 * The password is deliberately not trimmed: leading or trailing whitespace is part of
 * the credential, and stripping it here would not match what Better Auth later hashes.
 */
const signupSchema = z.object({
  workspaceName: z
    .string({ error: 'Workspace name is required' })
    .trim()
    .min(1, { error: 'Workspace name is required' })
    .max(100, { error: 'Workspace name is too long' }),
  name: z
    .string({ error: 'Your name is required' })
    .trim()
    .min(1, { error: 'Your name is required' })
    .max(100, { error: 'Name is too long' }),
  email: emailField,
  password: z
    .string({ error: 'Password is required' })
    .min(MIN_PASSWORD_LENGTH, {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    })
    .max(MAX_PASSWORD_LENGTH, {
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    }),
})

/**
 * Public tenant registration — the only way an account is created from outside.
 * Better Auth's own /api/auth/sign-up/email is disabled (see lib/auth.ts) because it
 * produces a user with no workspace and no role.
 */
signupRouter.post('/api/signup', signupLimiter, async (req, res) => {
  const parsed = parseBody(signupSchema, req.body)

  if (!parsed.success) {
    res.status(400).json(validationErrorBody(parsed.error))
    return
  }

  const values = parsed.data

  let created: Awaited<ReturnType<typeof createWorkspaceWithAdmin>>
  try {
    created = await createWorkspaceWithAdmin(values)
  } catch (err) {
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: err.message, fields: { email: err.message } })
      return
    }
    console.error('Signup failed:', err)
    res.status(500).json({ error: 'Could not create workspace' })
    return
  }

  // Sign the new admin in so they land already authenticated. The workspace exists
  // either way, so a failure here is a redirect-to-login, not a failed signup.
  let sessionIssued = false
  try {
    const signIn = await auth.api.signInEmail({
      body: { email: values.email, password: values.password },
      asResponse: true,
    })
    if (signIn.ok) {
      for (const cookie of signIn.headers.getSetCookie()) res.append('Set-Cookie', cookie)
      sessionIssued = true
    } else {
      console.error('Post-signup sign-in failed with status', signIn.status)
    }
  } catch (err) {
    console.error('Post-signup sign-in threw:', err)
  }

  res.status(201).json({
    sessionIssued,
    user: {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
    },
    workspace: {
      id: created.workspace.id,
      name: created.workspace.name,
      slug: created.workspace.slug,
    },
  })
})
