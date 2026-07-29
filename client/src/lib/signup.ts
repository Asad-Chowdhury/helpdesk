import { api, readApiError } from './api'
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
  try {
    // The response sets the session cookie; `api` sends credentials on every request.
    const { data } = await api.post<SignupResponse>('/api/signup', input)
    return data
  } catch (err) {
    const { message, fields } = readApiError(err, 'Signup failed')
    throw new SignupError(message, fields)
  }
}
