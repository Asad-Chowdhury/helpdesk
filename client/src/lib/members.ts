import { api, readApiError } from './api'
import type { Role } from './me'

export type Member = {
  id: string
  role: Role
  createdAt: string
  /** Null while active. A deactivated member keeps their row and can be reinstated. */
  deactivatedAt: string | null
  user: { id: string; name: string; email: string }
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  CLIENT: 'Client',
}

/** Mirrors the server's envelope: `{ error, fields? }`. Same shape as SignupError. */
export class MembersError extends Error {
  fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'MembersError'
    this.fields = fields
  }
}

/** Every call here reports failures as a MembersError, so callers catch one type. */
async function request<T>(send: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await send()
    return data
  } catch (err) {
    const { message, fields } = readApiError(err, 'Request failed')
    throw new MembersError(message, fields)
  }
}

export function fetchMembers(workspaceId: string): Promise<{ members: Member[] }> {
  return request(() => api.get(`/api/workspaces/${workspaceId}/users`))
}

export type AddMemberInput = { name: string; email: string; role: Role }

/**
 * `temporaryPassword` is only returned when the address was new and an account had to
 * be created — an existing user just gains a membership and keeps their own password.
 * It is never retrievable again, so the UI has to show it at this moment or not at all.
 */
export function addMember(
  workspaceId: string,
  input: AddMemberInput,
): Promise<{ member: Member; temporaryPassword?: string }> {
  return request(() => api.post(`/api/workspaces/${workspaceId}/users`, input))
}

export function updateMember(
  workspaceId: string,
  membershipId: string,
  patch: { role?: Role; active?: boolean },
): Promise<{ member: Member }> {
  return request(() => api.patch(`/api/workspaces/${workspaceId}/users/${membershipId}`, patch))
}

/**
 * Irreversible, unlike deactivation.
 *
 * `deleted` says what the server actually did: `'account'` when this workspace was the
 * person's only one and their account was erased outright, `'membership'` when they
 * belong to other workspaces and only lost access to this one. The server decides —
 * removing an account another tenant still uses is not this workspace's to do.
 */
export function deleteMember(
  workspaceId: string,
  membershipId: string,
): Promise<{ deleted: 'account' | 'membership' }> {
  return request(() => api.delete(`/api/workspaces/${workspaceId}/users/${membershipId}`))
}
