import { PersonLabel } from './PersonLabel'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketEvent,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets'

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * Enum values are stored raw in `fromValue`/`toValue`, so they are translated for display
 * here. Assignee and category values are already human names and pass through unchanged.
 */
function label(value: string | null, type: TicketEvent['type']): string {
  if (value === null) return 'nobody'
  if (type === 'STATUS_CHANGED') return STATUS_LABELS[value as TicketStatus] ?? value
  if (type === 'PRIORITY_CHANGED') return PRIORITY_LABELS[value as TicketPriority] ?? value
  return value
}

function describe(event: TicketEvent): string {
  switch (event.type) {
    case 'CREATED':
      return 'raised this ticket'
    case 'STATUS_CHANGED':
      return `changed status from ${label(event.fromValue, event.type)} to ${label(event.toValue, event.type)}`
    case 'PRIORITY_CHANGED':
      return `changed priority from ${label(event.fromValue, event.type)} to ${label(event.toValue, event.type)}`
    case 'ASSIGNED':
      return `assigned this to ${label(event.toValue, event.type)}`
    case 'UNASSIGNED':
      return `unassigned ${label(event.fromValue, event.type)}`
    case 'CATEGORY_CHANGED':
      return event.toValue
        ? `filed this under ${event.toValue}`
        : 'removed the category'
  }
}

/**
 * Append-only activity history (project-scope.md §3).
 *
 * The actor renders through PersonLabel like everywhere else, so an action taken by someone
 * whose account has since been deleted still says who did it — an audit trail that forgets
 * its actor is not one. That is the whole reason `TicketEvent.actorName` is a stored
 * snapshot rather than a join.
 */
export function TicketActivity({ events }: { events: TicketEvent[] }) {
  return (
    <section aria-labelledby="ticket-activity-heading" className="space-y-3">
      <h2 id="ticket-activity-heading" className="text-sm font-semibold text-foreground">
        Activity
      </h2>

      <ol className="space-y-2 border-l border-border pl-4">
        {events.map((event) => (
          <li key={event.id} className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              <PersonLabel person={event.actor} fallback="Someone" />
            </span>{' '}
            {describe(event)}
            <span className="ml-2 text-xs">
              {timeFormat.format(new Date(event.createdAt))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
