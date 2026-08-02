import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Navbar } from '@/components/Navbar'
import { Skeleton } from '@/components/ui/skeleton'
import { EditTicketDialog } from '@/components/tickets/EditTicketDialog'
import { TicketActivity } from '@/components/tickets/TicketActivity'
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/tickets/TicketBadges'
import { TicketComments } from '@/components/tickets/TicketComments'
import { TicketControls } from '@/components/tickets/TicketControls'
import { TicketDeleteButton } from '@/components/tickets/TicketDeleteButton'
import { fetchMe, primaryMembership } from '@/lib/me'
import { canDeleteTicket, canEditTicketFields } from '@/lib/ticket-policy'
import { fetchTicket, fetchTicketOptions } from '@/lib/tickets'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * One ticket: the request, the conversation, its activity history, and the controls for
 * whatever the caller's role permits.
 *
 * A ticket the caller may not see comes back as a 404 from the server rather than a 403 —
 * that is deliberate (it stops ticket ids being probed), so "not found" here covers both
 * "gone" and "not yours" and the message says so.
 */
export function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const membership = primaryMembership(me)
  const workspaceId = membership?.workspace.id

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['ticket', workspaceId, ticketId],
    queryFn: () => fetchTicket(workspaceId!, ticketId!),
    enabled: Boolean(workspaceId && ticketId),
  })

  const { data: options } = useQuery({
    queryKey: ['ticket-options', workspaceId],
    queryFn: () => fetchTicketOptions(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
  })

  const ticket = data?.ticket
  const role = membership?.role

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All tickets
        </Link>

        {isPending ? (
          <div className="mt-6 space-y-4">
            <span className="sr-only" role="status">
              Loading ticket…
            </span>
            <div aria-hidden className="space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        ) : isError ? (
          <ErrorAlert
            className="mt-6"
            title="Could not load this ticket"
            reason={error.message}
            onRetry={() => refetch()}
          />
        ) : (
          ticket &&
          workspaceId &&
          role && (
            <>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    <span className="text-muted-foreground">#{ticket.number}</span>{' '}
                    {ticket.subject}
                  </h1>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <TicketStatusBadge status={ticket.status} />
                    <TicketPriorityBadge priority={ticket.priority} />
                    <span>Raised {dateFormat.format(new Date(ticket.createdAt))}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  {canEditTicketFields(role) && (
                    <EditTicketDialog
                      workspaceId={workspaceId}
                      ticket={ticket}
                      options={options}
                    />
                  )}
                  {canDeleteTicket(role) && (
                    <TicketDeleteButton
                      workspaceId={workspaceId}
                      ticket={ticket}
                      onError={setActionError}
                    />
                  )}
                </div>
              </div>

              {actionError && (
                <ErrorAlert
                  className="mt-6"
                  title="That change was not saved"
                  reason={actionError}
                />
              )}

              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-8">
                  <section aria-labelledby="ticket-request-heading">
                    <h2
                      id="ticket-request-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Request
                    </h2>
                    {/* Plain text, escaped by React, with newlines preserved — the same
                        treatment as a comment body. */}
                    <p className="mt-2 text-sm whitespace-pre-wrap text-foreground">
                      {ticket.description}
                    </p>
                  </section>

                  <TicketComments
                    workspaceId={workspaceId}
                    ticketId={ticket.id}
                    comments={ticket.comments}
                    role={role}
                  />

                  <TicketActivity events={ticket.events} />
                </div>

                <div className="lg:sticky lg:top-6 lg:self-start">
                  <TicketControls
                    workspaceId={workspaceId}
                    ticket={ticket}
                    role={role}
                    userId={me!.user.id}
                    options={options}
                    onError={setActionError}
                  />
                </div>
              </div>
            </>
          )
        )}
      </main>
    </div>
  )
}
