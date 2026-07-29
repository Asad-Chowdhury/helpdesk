import { api, readApiError } from './api'

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'CLIENT'

export type Membership = {
  role: Role
  workspace: { id: string; name: string; slug: string }
}

export type Me = {
  user: { id: string; name: string; email: string }
  memberships: Membership[]
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
