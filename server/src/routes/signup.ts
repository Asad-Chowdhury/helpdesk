import { Router } from 'express'
import { auth } from '../lib/auth'
import { createWorkspaceWithAdmin, EmailTakenError } from '../services/workspace'

export const signupRouter = Router()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8 // matches Better Auth's default

type FieldErrors = Record<string, string>

function validate(body: unknown): { values: Record<string, string>; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const b = (body ?? {}) as Record<string, unknown>

  const read = (key: string) => (typeof b[key] === 'string' ? (b[key] as string).trim() : '')

  const workspaceName = read('workspaceName')
  const name = read('name')
  const email = read('email')
  const password = typeof b.password === 'string' ? b.password : ''

  if (!workspaceName) errors.workspaceName = 'Workspace name is required'
  else if (workspaceName.length > 100) errors.workspaceName = 'Workspace name is too long'

  if (!name) errors.name = 'Your name is required'
  else if (name.length > 100) errors.name = 'Name is too long'

  if (!email) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address'

  if (!password) errors.password = 'Password is required'
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`

  return { values: { workspaceName, name, email, password }, errors }
}

/**
 * Public tenant registration — the only way an account is created from outside.
 * Better Auth's own /api/auth/sign-up/email is disabled (see lib/auth.ts) because it
 * produces a user with no workspace and no role.
 */
signupRouter.post('/api/signup', async (req, res) => {
  const { values, errors } = validate(req.body)

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: 'Validation failed', fields: errors })
    return
  }

  let created: Awaited<ReturnType<typeof createWorkspaceWithAdmin>>
  try {
    created = await createWorkspaceWithAdmin({
      workspaceName: values.workspaceName!,
      name: values.name!,
      email: values.email!,
      password: values.password!,
    })
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
      body: { email: values.email!, password: values.password! },
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
