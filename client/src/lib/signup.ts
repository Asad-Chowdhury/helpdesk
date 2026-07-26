import { API_BASE_URL } from './api'
import type { SignupValues } from './schemas'

export type SignupResponse = {
  sessionIssued: boolean
  user: { id: string; name: string; email: string }
  workspace: { id: string; name: string; slug: string }
}

/** Field-level errors returned by the API (400 validation, 409 duplicate email). */
export class SignupError extends Error {
  fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'SignupError'
    this.fields = fields
  }
}

export async function signUp(input: SignupValues): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE_URL}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // the response sets the session cookie
    body: JSON.stringify(input),
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    throw new SignupError(
      body?.error ?? `Signup failed (${res.status})`,
      body?.fields ?? {},
    )
  }

  return body as SignupResponse
}
