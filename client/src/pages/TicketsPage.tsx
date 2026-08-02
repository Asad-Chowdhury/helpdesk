import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/ErrorAlert'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { NewTicketDialog } from '@/components/tickets/NewTicketDialog'
import { TicketFilters } from '@/components/tickets/TicketFilters'
import { TicketsTable } from '@/components/tickets/TicketsTable'
import { TicketsTableSkeleton } from '@/components/tickets/TicketsTableSkeleton'
import { fetchMe, primaryMembership } from '@/lib/me'
import { canCreateTicket, seesWholeQueue } from '@/lib/ticket-policy'
import { fetchTicketOptions, fetchTickets, type TicketFilters as Filters } from '@/lib/tickets'

const PER_PAGE = 25

/**
 * The unified queue (project-scope.md §3): search, filters, sorting and pagination over
 * every ticket the caller may see. A Client sees only their own — the server narrows the
 * query, so this page needs no special case for it.
 */
export function TicketsPage() {
  const [filters, setFilters] = useState<Filters>({ sort: 'newest', page: 1 })

  // Already cached — RequireAuth resolved this before the route rendered.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const membership = primaryMembership(me)
  const workspaceId = membership?.workspace.id

  const query = { ...filters, perPage: PER_PAGE }

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useQuery({
    // The filters are part of the key, so each combination caches separately and going
    // back to a previous filter is instant.
    queryKey: ['tickets', workspaceId, query],
    queryFn: () => fetchTickets(workspaceId!, query),
    enabled: Boolean(workspaceId),
    // Keeps the previous page on screen while the next one loads, instead of flashing the
    // skeleton on every page change.
    placeholderData: (previous) => previous,
  })

  const { data: options } = useQuery({
    queryKey: ['ticket-options', workspaceId],
    queryFn: () => fetchTicketOptions(workspaceId!),
    enabled: Boolean(workspaceId),
    // Members and categories change far less often than tickets do.
    staleTime: 5 * 60 * 1000,
  })

  const page = filters.page ?? 1
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tickets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {!membership
                ? 'Requests in this workspace.'
                : seesWholeQueue(membership.role)
                  ? `Requests in ${membership.workspace.name}.`
                  : `Tickets assigned to you, or raised by you, in ${membership.workspace.name}.`}
            </p>
          </div>
          {workspaceId && membership && canCreateTicket(membership.role) && (
            <NewTicketDialog workspaceId={workspaceId} role={membership.role} options={options} />
          )}
        </div>

        <div className="mt-6">
          <TicketFilters
            filters={filters}
            onChange={setFilters}
            options={options}
            showAssigneeFilter={membership ? seesWholeQueue(membership.role) : true}
          />
        </div>

        <div className="mt-6">
          {isPending ? (
            <TicketsTableSkeleton />
          ) : isError ? (
            <ErrorAlert
              title="Could not load tickets"
              reason={error.message}
              onRetry={() => refetch()}
            />
          ) : data.tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tickets match these filters.
            </p>
          ) : (
            <div
              // Dimmed while a new page is in flight, so stale rows are visibly stale
              // rather than silently wrong.
              className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            >
              <TicketsTable tickets={data.tickets} />

              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground" role="status">
                  {data.total} {data.total === 1 ? 'ticket' : 'tickets'} · page {page} of{' '}
                  {lastPage}
                </p>
                {lastPage > 1 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setFilters({ ...filters, page: page - 1 })}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= lastPage}
                      onClick={() => setFilters({ ...filters, page: page + 1 })}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
