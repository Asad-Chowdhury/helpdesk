import { api, readApiError } from './api'

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'CLIENT'

export type Membership = {
  role: Role
  workspace: { id: string; name: string; slug: string }
}

export type MeUser = {
  id: string
  name: string
  email: string
  /** Always false today — nothing can verify an address until email transport lands. */
  emailVerified?: boolean
  createdAt?: string
}

export type Me = {
  user: MeUser
  memberships: Membership[]
}

/** Mirrors the server's `{ error, fields? }` envelope, like SignupError and MembersError. */
export class MeError extends Error {
  fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'MeError'
    this.fields = fields
  }
}

export type ProfileInput = { name: string; email: string }

/**
 * Saves the signed-in user's own name and email. The server takes the target from the
 * session, so there is no id to pass — this can only ever edit you.
 *
 * Returns the same shape as fetchMe, which lets the caller seed the ['me'] cache
 * directly instead of refetching.
 */
export async function updateProfile(input: ProfileInput): Promise<Me> {
  try {
    const { data } = await api.patch<Me>('/api/me', input)
    return data
  } catch (err) {
    const { message, fields } = readApiError(err, 'Could not save your profile')
    throw new MeError(message, fields)
  }
}

/** Null when there is no valid session — a 401 is an expected answer here, not an error. */
export async function fetchMe(): Promise<Me | null> {
  try {
    const { data } = await api.get<Me>('/api/me')
    return data
  } catch (err) {
    const { message, status } = readApiError(err, 'Could not load your account')
    if (status === 401) return null
    throw new Error(message)
  }
}

/**
 * Until there is an active-workspace concept, "is an admin" means holding ADMIN in
 * any workspace. Revisit once a user can belong to more than one — the answer then
 * has to be scoped to the workspace being viewed.
 */
export function hasRole(me: Me | null | undefined, role: Role): boolean {
  return Boolean(me?.memberships.some((m) => m.role === role))
}
