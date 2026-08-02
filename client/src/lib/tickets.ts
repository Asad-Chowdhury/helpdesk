import { api, readApiError } from './api'
import type { Role } from './me'

export type TicketStatus = 'REQUESTED' | 'OPEN' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT'

/**
 * A person named on a ticket.
 *
 * `deleted` is the server's answer, not an inference: once an account is erased its
 * foreign key is nulled and `name`/`email` come from the snapshot the row kept. The UI
 * shows the name either way and marks it so nobody reads a stale name as a live member —
 * see `PersonLabel`.
 */
export type TicketPerson = {
  id: string | null
  name: string
  email: string | null
  deleted: boolean
}

export type TicketCategory = { id: string; name: string }

export type Ticket = {
  id: string
  number: number
  subject: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  category: TicketCategory | null
  requester: TicketPerson | null
  assignee: TicketPerson | null
}

export type TicketComment = {
  id: string
  body: string
  /** Internal notes are never sent to a Client — the server filters them out of the query. */
  internal: boolean
  createdAt: string
  author: TicketPerson | null
}

export type TicketEventType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'CATEGORY_CHANGED'

export type TicketEvent = {
  id: string
  type: TicketEventType
  fromValue: string | null
  toValue: string | null
  createdAt: string
  actor: TicketPerson | null
}

export type TicketDetail = Ticket & {
  description: string
  comments: TicketComment[]
  events: TicketEvent[]
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  REQUESTED: 'Requested',
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

/**
 * Declaration order is the workflow order (project-scope.md §4: Requested → Open →
 * Resolved → Closed) and the priority order is ascending severity, matching the Postgres
 * enums. Selects and filter chips iterate these, so they never drift from the server.
 */
export const TICKET_STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[]
export const TICKET_PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[]

/** Mirrors the server's `{ error, fields? }` envelope, like MembersError and MeError. */
export class TicketsError extends Error {
  fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'TicketsError'
    this.fields = fields
  }
}

async function request<T>(send: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await send()
    return data
  } catch (err) {
    const { message, fields } = readApiError(err, 'Request failed')
    throw new TicketsError(message, fields)
  }
}

export type TicketSort = 'newest' | 'oldest' | 'priority' | 'updated'

export type TicketFilters = {
  status?: TicketStatus[]
  priority?: TicketPriority[]
  categoryId?: string
  /** A user id, or 'unassigned' for tickets with nobody on them. */
  assigneeId?: string
  q?: string
  sort?: TicketSort
  page?: number
  perPage?: number
}

export type TicketListPage = {
  tickets: Ticket[]
  total: number
  page: number
  perPage: number
}

/**
 * Filters go on the query string. Empty arrays and blank strings are dropped rather than
 * sent, so a cleared filter reads as absent to the server instead of as "match nothing".
 */
function toParams(filters: TicketFilters): URLSearchParams {
  const params = new URLSearchParams()

  filters.status?.forEach((s) => params.append('status', s))
  filters.priority?.forEach((p) => params.append('priority', p))
  if (filters.categoryId) params.set('categoryId', filters.categoryId)
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.perPage) params.set('perPage', String(filters.perPage))

  return params
}

export function fetchTickets(
  workspaceId: string,
  filters: TicketFilters = {},
): Promise<TicketListPage> {
  const query = toParams(filters).toString()
  return request(() =>
    api.get(`/api/workspaces/${workspaceId}/tickets${query ? `?${query}` : ''}`),
  )
}

export function fetchTicket(
  workspaceId: string,
  ticketId: string,
): Promise<{ ticket: TicketDetail }> {
  return request(() => api.get(`/api/workspaces/${workspaceId}/tickets/${ticketId}`))
}

export type TicketFormOptions = {
  assignees: { id: string; name: string; email: string; role: Role }[]
  categories: TicketCategory[]
}

/** Assignees and categories for the create/edit selects, in one request. */
export function fetchTicketOptions(workspaceId: string): Promise<TicketFormOptions> {
  return request(() => api.get(`/api/workspaces/${workspaceId}/ticket-options`))
}

export type CreateTicketInput = {
  subject: string
  description: string
  categoryId?: string | null
  assigneeId?: string | null
  priority?: TicketPriority
}

export function createTicket(
  workspaceId: string,
  input: CreateTicketInput,
): Promise<{ ticket: TicketDetail }> {
  return request(() => api.post(`/api/workspaces/${workspaceId}/tickets`, input))
}

/**
 * A partial patch. `null` on `categoryId`/`assigneeId` clears the field; omitting it
 * leaves it alone — the server distinguishes the two, so do not send `undefined` as null.
 */
export type UpdateTicketInput = {
  subject?: string
  description?: string
  status?: TicketStatus
  priority?: TicketPriority
  categoryId?: string | null
  assigneeId?: string | null
}

export function updateTicket(
  workspaceId: string,
  ticketId: string,
  patch: UpdateTicketInput,
): Promise<{ ticket: TicketDetail }> {
  return request(() => api.patch(`/api/workspaces/${workspaceId}/tickets/${ticketId}`, patch))
}

export function addTicketComment(
  workspaceId: string,
  ticketId: string,
  input: { body: string; internal?: boolean },
): Promise<{ comment: TicketComment }> {
  return request(() =>
    api.post(`/api/workspaces/${workspaceId}/tickets/${ticketId}/comments`, input),
  )
}

/** Irreversible — takes the ticket's comments and activity history with it. Admin only. */
export function deleteTicket(
  workspaceId: string,
  ticketId: string,
): Promise<{ deleted: true }> {
  return request(() => api.delete(`/api/workspaces/${workspaceId}/tickets/${ticketId}`))
}
