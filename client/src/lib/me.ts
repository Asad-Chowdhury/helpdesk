import { API_BASE_URL } from './api'

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
  const res = await fetch(`${API_BASE_URL}/api/me`, { credentials: 'include' })

  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Could not load your account (${res.status})`)

  return res.json()
}

/**
 * Until there is an active-workspace concept, "is an admin" means holding ADMIN in
 * any workspace. Revisit once a user can belong to more than one — the answer then
 * has to be scoped to the workspace being viewed.
 */
export function hasRole(me: Me | null | undefined, role: Role): boolean {
  return Boolean(me?.memberships.some((m) => m.role === role))
}
