import type { Prisma } from '../../generated/prisma/client'
import type { Role, TicketPriority, TicketStatus } from '../../generated/prisma/enums'
import { prisma } from '../../lib/prisma'
import { lockWorkspace, type Tx } from '../../lib/workspace-lock'
import { newReplyToken } from '../email/addressing'
import {
  canAssign,
  canChangeStatus,
  canEditTicketFields,
  canSetPriority,
  canUseInternalNotes,
  ticketScopeFor,
} from './tickets.policy'
import type { CreateCommentBody, CreateTicketBody, ListTicketsQuery, UpdateTicketBody } from './tickets.schemas'

export class TicketNotFoundError extends Error {
  constructor() {
    super('Ticket not found')
    this.name = 'TicketNotFoundError'
  }
}

/** A role-based refusal on a specific field, so the client can say which one. */
export class TicketActionForbiddenError extends Error {
  field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'TicketActionForbiddenError'
    this.field = field
  }
}

export class InvalidCategoryError extends Error {
  constructor() {
    super('That category does not exist in this workspace')
    this.name = 'InvalidCategoryError'
  }
}

export class InvalidAssigneeError extends Error {
  constructor() {
    super('That person cannot be assigned tickets in this workspace')
    this.name = 'InvalidAssigneeError'
  }
}

/**
 * Whoever is making the request. Assembled by the route from the session plus the
 * membership `requireWorkspaceRole` resolved — never from the body.
 *
 * The name and email are here because every write snapshots them onto the row it creates
 * (see the note above `model Ticket`), so the record keeps its attribution after the
 * account is deleted.
 */
export type Actor = {
  userId: string
  role: Role
  name: string
  email: string
}

/**
 * A person named on a ticket, resolved for reading.
 *
 * `id` is null once the account has been deleted; `name` and `email` come from the
 * snapshot columns and survive it. `deleted` is stated rather than left for the client to
 * infer from a null id, so the UI does not have to encode that rule too.
 */
export type TicketPerson = {
  id: string | null
  name: string
  email: string | null
  deleted: boolean
}

/**
 * The single place the live-relation-or-snapshot decision is made.
 *
 * Prefers the live user row while it exists, so renaming yourself in /profile shows through
 * on tickets you already raised. Falls back to the snapshot when the relation is null,
 * which is exactly the deleted-account case. Every read path goes through this — if it
 * were duplicated, one of the copies would eventually forget the fallback and start
 * rendering a blank requester.
 */
function personFrom(
  live: { id: string; name: string; email: string } | null,
  snapshotName: string | null,
  snapshotEmail: string | null,
): TicketPerson | null {
  if (live) {
    return { id: live.id, name: live.name, email: live.email, deleted: false }
  }
  if (snapshotName === null) return null // genuinely nobody — an unassigned ticket
  return { id: null, name: snapshotName, email: snapshotEmail, deleted: true }
}

/**
 * Selecting people explicitly rather than `include: { requester: true }` keeps
 * emailVerified, image and anything added to User later out of ticket responses.
 */
const PERSON_SELECT = { id: true, name: true, email: true } as const

const TICKET_SELECT = {
  id: true,
  number: true,
  subject: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  category: { select: { id: true, name: true } },
  // The snapshot columns are read here but never sent: `toTicket` folds them into
  // `requester`/`assignee`, whose `id` already carries what the raw foreign key would.
  // Sending both would put two answers to "who is this" on the wire, and only one of them
  // survives a deletion.
  requesterName: true,
  requesterEmail: true,
  requester: { select: PERSON_SELECT },
  assigneeName: true,
  assigneeEmail: true,
  assignee: { select: PERSON_SELECT },
} as const

const TICKET_DETAIL_SELECT = { ...TICKET_SELECT, description: true } as const

type TicketRow = Prisma.TicketGetPayload<{ select: typeof TICKET_DETAIL_SELECT }>

/** The wire shape. Snapshot columns are collapsed into `requester`/`assignee` here. */
function toTicket<T extends Omit<TicketRow, 'description'>>(row: T) {
  const { requesterName, requesterEmail, assigneeName, assigneeEmail, ...rest } = row

  return {
    ...rest,
    requester: personFrom(row.requester, requesterName, requesterEmail),
    assignee: personFrom(row.assignee, assigneeName, assigneeEmail),
  }
}

export type Ticket = ReturnType<typeof toTicket>

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Narrows a query to what `actor` is allowed to see — the Prisma half of
 * `ticketScopeFor`, which is where the rule itself lives.
 *
 * Every read path uses this, including the single-ticket get/patch/comment paths, so a
 * ticket outside the caller's scope is never reachable by id either.
 *
 * Matching is on ids, never names, so a ticket stops being theirs the moment it is
 * reassigned — and a deleted account's tickets correctly match nobody.
 *
 * **The result must never be spread into a `where` object.** It can return `OR`, and a
 * sibling key in the same object would silently replace it. Every call site composes it
 * with `AND: [visibilityFilter(actor)]` instead — see the note in `listTickets`.
 */
function visibilityFilter(actor: Actor): Prisma.TicketWhereInput {
  switch (ticketScopeFor(actor.role)) {
    case 'all':
      return {}
    case 'assigned_or_requested':
      return { OR: [{ assigneeId: actor.userId }, { requesterId: actor.userId }] }
    case 'requested':
      return { requesterId: actor.userId }
  }
}

/**
 * Priority sorts on the Postgres enum, which orders by declaration order in the schema —
 * LOW, NORMAL, MEDIUM, HIGH, URGENT. They are declared in ascending severity precisely so
 * `desc` means "most urgent first" without a CASE expression or a numeric column.
 */
const ORDER_BY: Record<ListTicketsQuery['sort'], Prisma.TicketOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  updated: [{ updatedAt: 'desc' }],
  priority: [{ priority: 'desc' }, { createdAt: 'desc' }],
}

export async function listTickets(
  workspaceId: string,
  actor: Actor,
  query: ListTicketsQuery,
) {
  // Visibility and the user's filters are combined with AND rather than spread into one
  // object, and that is load-bearing: a Staff member's visibility is `assigneeId = me`,
  // and `?assigneeId=<someone-else>` is *also* an `assigneeId` key. Spreading would let
  // the query string overwrite the permission check and hand them another person's queue.
  // Under AND both must hold, so that request correctly returns nothing.
  const where: Prisma.TicketWhereInput = {
    workspaceId,
    AND: [
      visibilityFilter(actor),
      {
        ...(query.status ? { status: { in: query.status } } : {}),
        ...(query.priority ? { priority: { in: query.priority } } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        // 'unassigned' is its own case: `assigneeId: undefined` would mean "no filter".
        ...(query.assigneeId === 'unassigned'
          ? { assigneeId: null }
          : query.assigneeId
            ? { assigneeId: query.assigneeId }
            : {}),
        ...searchFilter(query.q),
      },
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: TICKET_SELECT,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.ticket.count({ where }),
  ])

  return { tickets: rows.map(toTicket), total, page: query.page, perPage: query.perPage }
}

/**
 * Free text over subject and description, plus an exact ticket-number match when the term
 * is a number — "1284" almost always means #1284 rather than a body containing that digit
 * string, and searching both costs nothing.
 *
 * `contains` compiles to a parameterised LIKE, so the term is never interpolated into SQL.
 */
function searchFilter(q: string | undefined): Prisma.TicketWhereInput {
  if (!q) return {}

  const or: Prisma.TicketWhereInput[] = [
    { subject: { contains: q, mode: 'insensitive' } },
    { description: { contains: q, mode: 'insensitive' } },
  ]

  const asNumber = Number(q)
  if (Number.isInteger(asNumber) && asNumber > 0) or.push({ number: asNumber })

  return { OR: or }
}

/**
 * One ticket with its thread and activity history.
 *
 * A ticket the caller may not see is reported as not found rather than forbidden: a 403
 * would confirm that a ticket with that id exists in this workspace, which is the same
 * enumeration problem `requireWorkspaceRole` returns a flat 403 to avoid one level up.
 */
export async function getTicket(workspaceId: string, ticketId: string, actor: Actor) {
  const showInternal = canUseInternalNotes(actor.role)

  const row = await prisma.ticket.findFirst({
    // AND, never spread: visibilityFilter can return `OR`, which a sibling key would replace.
    where: { id: ticketId, workspaceId, AND: [visibilityFilter(actor)] },
    select: {
      ...TICKET_DETAIL_SELECT,
      comments: {
        // Internal notes are excluded from the QUERY, not from the response, so a Client's
        // request never loads them at all.
        where: showInternal ? {} : { internal: false },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          internal: true,
          createdAt: true,
          authorName: true,
          authorEmail: true,
          author: { select: PERSON_SELECT },
        },
      },
      events: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          fromValue: true,
          toValue: true,
          createdAt: true,
          actorName: true,
          actor: { select: PERSON_SELECT },
        },
      },
    },
  })

  if (!row) throw new TicketNotFoundError()

  const { comments, events, ...ticket } = row

  return {
    ...toTicket(ticket),
    description: row.description,
    comments: comments.map(({ authorName, authorEmail, ...c }) => ({
      ...c,
      author: personFrom(c.author, authorName, authorEmail),
    })),
    events: events.map(({ actorName, ...e }) => ({
      ...e,
      actor: personFrom(e.actor, actorName, null),
    })),
  }
}

export type TicketDetail = Awaited<ReturnType<typeof getTicket>>

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Resolves an assignee id to the snapshot fields stored on the ticket.
 *
 * Requires an *active* membership with a staff-side role in this workspace: assigning work
 * to a Client, to a deactivated member, or to someone from another tenant are all the same
 * refusal. This is what stops `assigneeId` from being a cross-tenant read — without it a
 * caller could probe for user ids by watching which ones are accepted.
 */
async function resolveAssignee(tx: Tx, workspaceId: string, assigneeId: string) {
  const membership = await tx.membership.findFirst({
    where: {
      workspaceId,
      userId: assigneeId,
      deactivatedAt: null,
      role: { in: ['ADMIN', 'MANAGER', 'STAFF'] },
    },
    select: { user: { select: PERSON_SELECT } },
  })

  if (!membership) throw new InvalidAssigneeError()

  return {
    assigneeId,
    assigneeName: membership.user.name,
    assigneeEmail: membership.user.email,
  }
}

/** Scoped by workspaceId, so a category id from another tenant is simply invalid. */
async function resolveCategory(tx: Tx, workspaceId: string, categoryId: string) {
  const category = await tx.category.findFirst({
    where: { id: categoryId, workspaceId },
    select: { id: true, name: true },
  })

  if (!category) throw new InvalidCategoryError()
  return category
}

/**
 * Raises a ticket.
 *
 * The per-workspace `number` is allocated under `lockWorkspace`, because "read the highest
 * number, then insert the next one" is the read-then-write shape READ COMMITTED does not
 * make safe: two concurrent creates both read the same max and both try to insert it, and
 * the `@@unique([workspaceId, number])` turns the loser into a 500 rather than a duplicate.
 * The lock serialises ticket creation per workspace, which is an acceptable cost at this
 * scale — if it ever isn't, the fix is a per-workspace Postgres sequence, not dropping the
 * guarantee that numbers are gapless and unique.
 */
export async function createTicket(
  workspaceId: string,
  actor: Actor,
  body: CreateTicketBody,
) {
  // Priority is Admin-only to set. A non-admin sending one is refused rather than silently
  // downgraded, so the caller learns their value was not applied.
  if (body.priority !== undefined && !canSetPriority(actor.role)) {
    throw new TicketActionForbiddenError('Only an admin can set a ticket priority', 'priority')
  }
  if (body.assigneeId != null && !canAssign(actor.role)) {
    throw new TicketActionForbiddenError('Only an admin or manager can assign tickets', 'assigneeId')
  }

  const ticketId = await prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId)

    const highest = await tx.ticket.aggregate({
      where: { workspaceId },
      _max: { number: true },
    })

    const category = body.categoryId
      ? await resolveCategory(tx, workspaceId, body.categoryId)
      : null
    const assignee = body.assigneeId
      ? await resolveAssignee(tx, workspaceId, body.assigneeId)
      : null

    const ticket = await tx.ticket.create({
      data: {
        workspaceId,
        number: (highest._max.number ?? 0) + 1,
        subject: body.subject,
        description: body.description,
        priority: body.priority ?? 'NORMAL',
        categoryId: category?.id ?? null,
        // The requester is whoever raised it. Snapshotted here so the ticket keeps its
        // origin after the account goes.
        requesterId: actor.userId,
        requesterName: actor.name,
        requesterEmail: actor.email,
        // Minted for every ticket, not just emailed-in ones: notifications about a
        // web-raised ticket need a threadable Reply-To too.
        replyToken: newReplyToken(),
        ...(assignee ?? {}),
      },
      select: { id: true },
    })

    const events: Prisma.TicketEventCreateManyInput[] = [
      { ticketId: ticket.id, workspaceId, type: 'CREATED', actorId: actor.userId, actorName: actor.name },
    ]
    if (assignee) {
      events.push({
        ticketId: ticket.id,
        workspaceId,
        type: 'ASSIGNED',
        toValue: assignee.assigneeName,
        actorId: actor.userId,
        actorName: actor.name,
      })
    }
    await tx.ticketEvent.createMany({ data: events })

    return ticket.id
  })

  // Re-read through getTicket so a write returns exactly the shape a read does — see the
  // note on updateTicket.
  return getTicket(workspaceId, ticketId, actor)
}

/**
 * Applies a patch field by field, each behind its own rule.
 *
 * A caller who may change the status but not the priority, sending both, is refused
 * outright rather than having the permitted half applied — a partial write nobody asked
 * for is harder to reason about than a rejection.
 *
 * Every real change appends a TicketEvent inside the same transaction, so the activity
 * history cannot drift from the row it describes.
 *
 * **Returns the full detail — comments and events included — not just the changed row.**
 * A write and a read must produce the same shape, because the client writes this response
 * straight into the cache the detail page renders from. Returning the bare ticket here was
 * a real bug: assigning someone replaced the cached ticket with an object that had no
 * `comments` or `events`, and the page crashed on `ticket.comments.length` before the
 * follow-up refetch could land. The extra read is the price of that guarantee, and it is
 * also correct — the patch has just appended activity the caller needs to see.
 */
export async function updateTicket(
  workspaceId: string,
  ticketId: string,
  actor: Actor,
  patch: UpdateTicketBody,
) {
  const updatedId = await prisma.$transaction(async (tx) => {
    const current = await tx.ticket.findFirst({
      // AND, never spread: visibilityFilter can return `OR`, which a sibling key would replace.
    where: { id: ticketId, workspaceId, AND: [visibilityFilter(actor)] },
      select: {
        id: true,
        status: true,
        priority: true,
        assigneeId: true,
        assigneeName: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    })

    if (!current) throw new TicketNotFoundError()

    const editsFields =
      patch.subject !== undefined ||
      patch.description !== undefined ||
      patch.categoryId !== undefined

    if (editsFields && !canEditTicketFields(actor.role)) {
      throw new TicketActionForbiddenError('Only an admin or manager can edit ticket details')
    }
    if (
      patch.status !== undefined &&
      !canChangeStatus(actor.role, actor.userId, current.assigneeId)
    ) {
      throw new TicketActionForbiddenError(
        'You can only change the status of tickets assigned to you',
        'status',
      )
    }
    if (patch.priority !== undefined && !canSetPriority(actor.role)) {
      throw new TicketActionForbiddenError('Only an admin can override priority', 'priority')
    }
    if (patch.assigneeId !== undefined && !canAssign(actor.role)) {
      throw new TicketActionForbiddenError(
        'Only an admin or manager can assign tickets',
        'assigneeId',
      )
    }

    const data: Prisma.TicketUpdateInput = {}
    const events: Prisma.TicketEventCreateManyInput[] = []
    const record = (
      type: Prisma.TicketEventCreateManyInput['type'],
      fromValue: string | null,
      toValue: string | null,
    ) => events.push({ ticketId: current.id, workspaceId, type, fromValue, toValue, actorId: actor.userId, actorName: actor.name })

    if (patch.subject !== undefined) data.subject = patch.subject
    if (patch.description !== undefined) data.description = patch.description

    if (patch.status !== undefined && patch.status !== current.status) {
      data.status = patch.status
      Object.assign(data, statusTimestamps(patch.status))
      record('STATUS_CHANGED', current.status, patch.status)
    }

    if (patch.priority !== undefined && patch.priority !== current.priority) {
      data.priority = patch.priority
      record('PRIORITY_CHANGED', current.priority, patch.priority)
    }

    if (patch.categoryId !== undefined) {
      const next = patch.categoryId ? await resolveCategory(tx, workspaceId, patch.categoryId) : null
      if ((next?.id ?? null) !== current.categoryId) {
        data.category = next ? { connect: { id: next.id } } : { disconnect: true }
        record('CATEGORY_CHANGED', current.category?.name ?? null, next?.name ?? null)
      }
    }

    if (patch.assigneeId !== undefined) {
      // null clears the assignment; a `nullish` field distinguishes that from absent.
      const next = patch.assigneeId
        ? await resolveAssignee(tx, workspaceId, patch.assigneeId)
        : { assigneeId: null, assigneeName: null, assigneeEmail: null }

      if (next.assigneeId !== current.assigneeId) {
        Object.assign(data, next)
        record(
          next.assigneeId ? 'ASSIGNED' : 'UNASSIGNED',
          current.assigneeName,
          next.assigneeName,
        )
      }
    }

    await tx.ticket.update({
      where: { id: current.id },
      data,
      select: { id: true },
    })

    if (events.length > 0) await tx.ticketEvent.createMany({ data: events })

    return current.id
  })

  return getTicket(workspaceId, updatedId, actor)
}

/**
 * Keeps resolvedAt/closedAt consistent with the status rather than letting a caller set
 * them. Moving back to an open state clears both, so "resolved 3 days ago" never sits on a
 * ticket that is currently open.
 */
function statusTimestamps(status: TicketStatus) {
  switch (status) {
    case 'RESOLVED':
      return { resolvedAt: new Date(), closedAt: null }
    case 'CLOSED':
      return { closedAt: new Date() }
    default:
      return { resolvedAt: null, closedAt: null }
  }
}

/**
 * Destroys the request and its whole history — comments and events cascade from the ticket.
 * Admin-only (checked in the route via the policy module) and irreversible.
 */
export async function deleteTicket(workspaceId: string, ticketId: string) {
  // Scoped by workspaceId as well as id: an admin of one workspace cannot even confirm a
  // ticket id exists in another.
  const { count } = await prisma.ticket.deleteMany({ where: { id: ticketId, workspaceId } })
  if (count === 0) throw new TicketNotFoundError()
}

/**
 * Adds a comment, or an internal note when `internal` is true.
 *
 * Visibility is re-checked here rather than trusted from a prior GET: the caller may have
 * loaded the page while they still had access.
 */
export async function addComment(
  workspaceId: string,
  ticketId: string,
  actor: Actor,
  body: CreateCommentBody,
) {
  if (body.internal && !canUseInternalNotes(actor.role)) {
    throw new TicketActionForbiddenError('You cannot add internal notes', 'internal')
  }

  const ticket = await prisma.ticket.findFirst({
    // AND, never spread: visibilityFilter can return `OR`, which a sibling key would replace.
    where: { id: ticketId, workspaceId, AND: [visibilityFilter(actor)] },
    select: { id: true },
  })

  if (!ticket) throw new TicketNotFoundError()

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: ticket.id,
      workspaceId,
      body: body.body,
      internal: body.internal ?? false,
      authorId: actor.userId,
      authorName: actor.name,
      authorEmail: actor.email,
    },
    select: {
      id: true,
      body: true,
      internal: true,
      createdAt: true,
      authorName: true,
      authorEmail: true,
      author: { select: PERSON_SELECT },
    },
  })

  const { authorName, authorEmail, ...rest } = comment
  return { ...rest, author: personFrom(comment.author, authorName, authorEmail) }
}

/**
 * The people a ticket can be assigned to, and the categories it can be filed under —
 * everything the create/edit forms need to render their selects, in one request.
 */
export async function listTicketFormOptions(workspaceId: string) {
  const [memberships, categories] = await Promise.all([
    prisma.membership.findMany({
      where: { workspaceId, deactivatedAt: null, role: { in: ['ADMIN', 'MANAGER', 'STAFF'] } },
      select: { role: true, user: { select: PERSON_SELECT } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.category.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return {
    assignees: memberships.map((m) => ({ ...m.user, role: m.role })),
    categories,
  }
}

export type TicketFormOptions = Awaited<ReturnType<typeof listTicketFormOptions>>
export type { TicketPriority, TicketStatus }

// ─── Email intake ────────────────────────────────────────────────────────────

/** Whoever an inbound email resolved to. No role checks happen against this — see below. */
export type EmailRequester = { userId: string; name: string; email: string }

/**
 * Raises a ticket on behalf of an email sender.
 *
 * **Separate from `createTicket` on purpose, not by accident.** That function takes an
 * `Actor`, runs `canSetPriority`/`canAssign` against their role, and re-reads the result
 * through the caller's own visibility filter. None of that has meaning for a webhook:
 * there is no session, and email intake is a different channel with a different credential
 * — control of a mailbox holding an active membership, proved by `resolveInboundTarget`
 * before this is called. Reusing `createTicket` would have meant faking an Actor and
 * silently inheriting rules written for a different question.
 *
 * What it *does* share is the part that must not be reimplemented: `lockWorkspace` and the
 * `max(number) + 1` allocation. `@@unique([workspaceId, number])` has no default, so two
 * concurrent deliveries without that lock produce a duplicate-key failure rather than two
 * tickets.
 *
 * Takes the transaction from its caller so the `InboundEmail` dedupe row and this ticket
 * commit together — that is what makes a provider retry a no-op instead of a second ticket.
 */
export async function createTicketFromEmail(
  tx: Tx,
  workspaceId: string,
  requester: EmailRequester,
  input: { subject: string; description: string },
): Promise<{ id: string; number: number }> {
  await lockWorkspace(tx, workspaceId)

  const highest = await tx.ticket.aggregate({
    where: { workspaceId },
    _max: { number: true },
  })

  const ticket = await tx.ticket.create({
    data: {
      workspaceId,
      number: (highest._max.number ?? 0) + 1,
      subject: input.subject,
      description: input.description,
      source: 'EMAIL',
      replyToken: newReplyToken(),
      requesterId: requester.userId,
      requesterName: requester.name,
      requesterEmail: requester.email,
    },
    select: { id: true, number: true },
  })

  await tx.ticketEvent.create({
    data: {
      ticketId: ticket.id,
      workspaceId,
      type: 'CREATED',
      actorId: requester.userId,
      actorName: requester.name,
    },
  })

  return ticket
}

/**
 * Appends an emailed reply to a ticket.
 *
 * **Always public, never an internal note.** An internal note is a thing staff write for
 * each other; nothing arriving by email can be trusted to be one, and getting it wrong
 * leaks team-only discussion to a requester. The flag is hardcoded rather than derived.
 *
 * Visibility was checked by `resolveInboundTarget` — this is scoped by `workspaceId` as a
 * second line, so a ticket id from another tenant writes nothing.
 */
export async function addEmailComment(
  tx: Tx,
  workspaceId: string,
  ticketId: string,
  author: EmailRequester,
  body: string,
): Promise<{ id: string }> {
  const ticket = await tx.ticket.findFirst({
    where: { id: ticketId, workspaceId },
    select: { id: true },
  })
  if (!ticket) throw new TicketNotFoundError()

  return tx.ticketComment.create({
    data: {
      ticketId: ticket.id,
      workspaceId,
      body,
      internal: false,
      authorId: author.userId,
      authorName: author.name,
      authorEmail: author.email,
    },
    select: { id: true },
  })
}
