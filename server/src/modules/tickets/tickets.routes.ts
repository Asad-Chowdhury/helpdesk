import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../../middleware/require-auth'
import { requireWorkspaceRole } from '../../middleware/require-workspace-role'
import { parseBody, validationErrorBody } from '../../lib/validation'
import { canCreateTicket, canDeleteTicket } from './tickets.policy'
import {
  createCommentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from './tickets.schemas'
import {
  addComment,
  createTicket,
  deleteTicket,
  getTicket,
  InvalidAssigneeError,
  InvalidCategoryError,
  listTicketFormOptions,
  listTickets,
  TicketActionForbiddenError,
  TicketNotFoundError,
  updateTicket,
  type Actor,
} from './tickets.service'

/**
 * Ticket management. Full paths are registered here and index.ts mounts the router bare,
 * matching usersRouter and signupRouter.
 */
export const ticketsRouter = Router()

/**
 * Every route below is open to any *active member* of the workspace, whatever their role —
 * `requireWorkspaceRole` is still the tenant boundary, and it is what rejects non-members
 * and deactivated memberships with a flat 403.
 *
 * Listing all four roles is deliberate rather than a wildcard: it keeps the boundary
 * explicit, and a role added to the enum later has to be considered here instead of
 * silently gaining access to every ticket in the workspace.
 *
 * Role differences within the workspace are then applied per action by tickets.policy.ts.
 * A Client reaching these routes sees only their own tickets and no internal notes.
 */
const anyMember = [
  requireAuth,
  requireWorkspaceRole('ADMIN', 'MANAGER', 'STAFF', 'CLIENT'),
] as const

/**
 * The caller, assembled from the session and the membership the middleware resolved.
 *
 * `req.membership.role` comes from the database on this request, never from the client, and
 * the name/email are what gets snapshotted onto whatever the caller creates.
 */
function actorFrom(req: Request): Actor {
  return {
    userId: req.user!.id,
    role: req.membership!.role,
    name: req.user!.name,
    email: req.user!.email,
  }
}

/** The error mapping every ticket route shares, so statuses cannot drift between them. */
function handleTicketError(res: Response, err: unknown, fallback: string) {
  if (err instanceof TicketNotFoundError) {
    res.status(404).json({ error: err.message })
    return
  }
  if (err instanceof TicketActionForbiddenError) {
    // 403, not 400: the request is well-formed and the caller simply may not do it.
    res.status(403).json({
      error: err.message,
      ...(err.field ? { fields: { [err.field]: err.message } } : {}),
    })
    return
  }
  if (err instanceof InvalidCategoryError) {
    res.status(400).json({ error: err.message, fields: { categoryId: err.message } })
    return
  }
  if (err instanceof InvalidAssigneeError) {
    res.status(400).json({ error: err.message, fields: { assigneeId: err.message } })
    return
  }
  console.error(`${fallback}:`, err)
  res.status(500).json({ error: fallback })
}

ticketsRouter.get('/api/workspaces/:workspaceId/tickets', ...anyMember, async (req, res) => {
  // Filters come off the query string, so they are parsed with the same zod pipeline as a
  // body — an out-of-range perPage is a 400, not an unbounded query.
  const parsed = listTicketsQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    res.status(400).json(validationErrorBody(parsed.error))
    return
  }

  try {
    res.json(await listTickets(req.params.workspaceId!, actorFrom(req), parsed.data))
  } catch (err) {
    handleTicketError(res, err, 'Could not load tickets')
  }
})

/**
 * Assignees and categories for the create/edit forms. Behind the same membership check as
 * the tickets themselves — it lists the workspace's people, so it is not public.
 */
ticketsRouter.get(
  '/api/workspaces/:workspaceId/ticket-options',
  ...anyMember,
  async (req, res) => {
    try {
      res.json(await listTicketFormOptions(req.params.workspaceId!))
    } catch (err) {
      handleTicketError(res, err, 'Could not load ticket options')
    }
  },
)

ticketsRouter.post('/api/workspaces/:workspaceId/tickets', ...anyMember, async (req, res) => {
  // Checked before parsing: a Client gets the same refusal whether or not their body is
  // valid, so a validation error cannot be used to probe what the endpoint accepts.
  if (!canCreateTicket(req.membership!.role)) {
    res.status(403).json({ error: 'You cannot raise tickets in this workspace' })
    return
  }

  const parsed = parseBody(createTicketSchema, req.body)

  if (!parsed.success) {
    res.status(400).json(validationErrorBody(parsed.error))
    return
  }

  try {
    const ticket = await createTicket(req.params.workspaceId!, actorFrom(req), parsed.data)
    res.status(201).json({ ticket })
  } catch (err) {
    handleTicketError(res, err, 'Could not create this ticket')
  }
})

ticketsRouter.get(
  '/api/workspaces/:workspaceId/tickets/:ticketId',
  ...anyMember,
  async (req, res) => {
    try {
      const ticket = await getTicket(
        req.params.workspaceId!,
        req.params.ticketId!,
        actorFrom(req),
      )
      res.json({ ticket })
    } catch (err) {
      handleTicketError(res, err, 'Could not load this ticket')
    }
  },
)

ticketsRouter.patch(
  '/api/workspaces/:workspaceId/tickets/:ticketId',
  ...anyMember,
  async (req, res) => {
    const parsed = parseBody(updateTicketSchema, req.body)

    if (!parsed.success) {
      res.status(400).json(validationErrorBody(parsed.error))
      return
    }

    try {
      const ticket = await updateTicket(
        req.params.workspaceId!,
        req.params.ticketId!,
        actorFrom(req),
        parsed.data,
      )
      res.json({ ticket })
    } catch (err) {
      handleTicketError(res, err, 'Could not update this ticket')
    }
  },
)

ticketsRouter.post(
  '/api/workspaces/:workspaceId/tickets/:ticketId/comments',
  ...anyMember,
  async (req, res) => {
    const parsed = parseBody(createCommentSchema, req.body)

    if (!parsed.success) {
      res.status(400).json(validationErrorBody(parsed.error))
      return
    }

    try {
      const comment = await addComment(
        req.params.workspaceId!,
        req.params.ticketId!,
        actorFrom(req),
        parsed.data,
      )
      res.status(201).json({ comment })
    } catch (err) {
      handleTicketError(res, err, 'Could not add this comment')
    }
  },
)

/** Irreversible, and takes the ticket's comments and activity history with it. Admin only. */
ticketsRouter.delete(
  '/api/workspaces/:workspaceId/tickets/:ticketId',
  ...anyMember,
  async (req, res) => {
    if (!canDeleteTicket(req.membership!.role)) {
      res.status(403).json({ error: 'Only an admin can delete a ticket' })
      return
    }

    try {
      await deleteTicket(req.params.workspaceId!, req.params.ticketId!)
      res.json({ deleted: true })
    } catch (err) {
      handleTicketError(res, err, 'Could not delete this ticket')
    }
  },
)
