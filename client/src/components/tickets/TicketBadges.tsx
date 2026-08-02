import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets'

/**
 * Colour is never the only signal — each badge carries its label as text, so the status of
 * a ticket is readable without distinguishing hues. The classes use theme tokens rather
 * than raw colours so both themes stay legible.
 */
const STATUS_CLASS: Record<TicketStatus, string> = {
  REQUESTED: 'bg-muted text-muted-foreground',
  OPEN: 'bg-primary/15 text-foreground',
  RESOLVED: 'bg-secondary text-secondary-foreground',
  CLOSED: 'border-border text-muted-foreground bg-transparent border',
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', STATUS_CLASS[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  LOW: 'border-border text-muted-foreground bg-transparent border',
  NORMAL: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-primary/15 text-foreground',
  HIGH: 'bg-destructive/10 text-destructive',
  URGENT: 'bg-destructive text-destructive-foreground',
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', PRIORITY_CLASS[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}
