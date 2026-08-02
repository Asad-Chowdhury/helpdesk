import type { TicketPerson } from '@/lib/tickets'

type Props = {
  person: TicketPerson | null
  /** Shown when there is nobody — "Unassigned" on a ticket, for instance. */
  fallback?: string
  className?: string
}

/**
 * Renders a person named on a ticket, including one whose account no longer exists.
 *
 * A deleted account keeps its name on the row (see the snapshot columns on `model Ticket`),
 * so the record stays readable — but it must not read as a current member, or a manager
 * would try to reassign work to someone who cannot log in. Hence the explicit marker
 * rather than silently showing a name that resolves to nothing.
 *
 * The marker is a real word in the accessible name, not a colour or an icon: "Sam Staff
 * (deleted)" is what a screen reader should say, and the title attribute carries the longer
 * explanation for anyone who hovers.
 */
export function PersonLabel({ person, fallback = 'Unassigned', className }: Props) {
  if (!person) {
    return <span className={className ?? 'text-muted-foreground'}>{fallback}</span>
  }

  if (!person.deleted) {
    return <span className={className}>{person.name}</span>
  }

  return (
    <span className={className}>
      <span className="text-muted-foreground">{person.name}</span>
      <span
        className="ml-1.5 text-xs text-muted-foreground italic"
        title="This account has been deleted. The ticket keeps their name so the record stays complete."
      >
        (deleted)
      </span>
    </span>
  )
}
