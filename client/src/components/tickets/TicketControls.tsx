import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PersonLabel } from './PersonLabel'
import type { Role } from '@/lib/me'
import { canAssign, canChangeStatus, canSetPriority } from '@/lib/ticket-policy'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  updateTicket,
  type TicketDetail,
  type TicketFormOptions,
  type TicketPriority,
  type TicketStatus,
  type UpdateTicketInput,
} from '@/lib/tickets'

type Props = {
  workspaceId: string
  ticket: TicketDetail
  role: Role
  userId: string
  options: TicketFormOptions | undefined
  onError: (message: string) => void
}

const UNASSIGNED = '__unassigned__'

/**
 * Status, priority and assignee for one ticket.
 *
 * Each control is rendered only when the caller's role allows it, and read-only text takes
 * its place otherwise — a disabled select that never becomes enabled just invites clicking.
 * The rules are re-checked on the server; this only decides what to show.
 *
 * Every successful write invalidates the ticket (its activity history has just grown) and
 * the list (status, priority and assignee are all columns there).
 */
export function TicketControls({
  workspaceId,
  ticket,
  role,
  userId,
  options,
  onError,
}: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (patch: UpdateTicketInput) => updateTicket(workspaceId, ticket.id, patch),
    onSuccess: ({ ticket: updated }) => {
      queryClient.setQueryData(['ticket', workspaceId, ticket.id], { ticket: updated })
      queryClient.invalidateQueries({ queryKey: ['ticket', workspaceId, ticket.id] })
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId] })
    },
    // A refusal leaves the ticket untouched, so the select snaps back to the real value on
    // the next render — no optimistic state to unwind.
    onError: (err) => onError(err.message),
  })

  const mayChangeStatus = canChangeStatus(role, userId, ticket)
  const maySetPriority = canSetPriority(role)
  const mayAssign = canAssign(role)
  const busy = mutation.isPending

  // A deleted assignee has no id to select, so the control falls back to UNASSIGNED and
  // the snapshot name is shown as a note beneath it instead.
  const assigneeItems: Record<string, string> = {
    [UNASSIGNED]: 'Unassigned',
    ...Object.fromEntries((options?.assignees ?? []).map((a) => [a.id, a.name])),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="ticket-status-select">Status</FieldLabel>
          {mayChangeStatus ? (
            <Select
              items={STATUS_LABELS}
              value={ticket.status}
              disabled={busy}
              onValueChange={(value) => mutation.mutate({ status: value as TicketStatus })}
            >
              <SelectTrigger id="ticket-status-select" className="w-full" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-foreground">{STATUS_LABELS[ticket.status]}</p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="ticket-priority-select">Priority</FieldLabel>
          {maySetPriority ? (
            <Select
              items={PRIORITY_LABELS}
              value={ticket.priority}
              disabled={busy}
              onValueChange={(value) => mutation.mutate({ priority: value as TicketPriority })}
            >
              <SelectTrigger id="ticket-priority-select" className="w-full" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-foreground">
              {PRIORITY_LABELS[ticket.priority]}
              {/* Says why it is read-only, rather than leaving the absence of a control
                  unexplained. Admin-only per project-scope.md §1. */}
              <span className="ml-2 text-xs text-muted-foreground">(admin only)</span>
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="ticket-assignee-select">Assignee</FieldLabel>
          {mayAssign ? (
            <Select
              items={assigneeItems}
              // A deleted assignee has no id, so the select shows Unassigned — which is
              // effectively true: nobody who can log in is on this ticket. The snapshot
              // name is still shown beneath, so the history is not lost.
              value={ticket.assignee?.id ?? UNASSIGNED}
              disabled={busy}
              onValueChange={(value) =>
                mutation.mutate({ assigneeId: value === UNASSIGNED ? null : value })
              }
            >
              <SelectTrigger id="ticket-assignee-select" className="w-full" aria-label="Assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {(options?.assignees ?? []).map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-foreground">
              <PersonLabel person={ticket.assignee} />
            </p>
          )}
          {ticket.assignee?.deleted && (
            <p className="text-xs text-muted-foreground">
              Was assigned to {ticket.assignee.name}, whose account has been deleted.
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel>Requester</FieldLabel>
          <p className="text-sm text-foreground">
            <PersonLabel person={ticket.requester} fallback="Unknown" />
          </p>
          {ticket.requester?.email && (
            <p className="text-xs text-muted-foreground">{ticket.requester.email}</p>
          )}
        </Field>

        <Field>
          <FieldLabel>Category</FieldLabel>
          <p className="text-sm text-foreground">{ticket.category?.name ?? 'No category'}</p>
        </Field>

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Saving…
          </p>
        )}
      </CardContent>
    </Card>
  )
}
