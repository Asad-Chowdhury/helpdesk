import { Link } from 'react-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PersonLabel } from './PersonLabel'
import { TicketPriorityBadge, TicketStatusBadge } from './TicketBadges'
import type { Ticket } from '@/lib/tickets'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Requested</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="text-muted-foreground tabular-nums">
              {ticket.number}
            </TableCell>
            <TableCell className="font-medium text-foreground">
              {/* The whole row's identity — the subject is the link, so the accessible
                  name of each link is the ticket it opens. */}
              <Link
                to={`/tickets/${ticket.id}`}
                className="underline-offset-4 hover:underline"
              >
                {ticket.subject}
              </Link>
            </TableCell>
            <TableCell>
              <TicketStatusBadge status={ticket.status} />
            </TableCell>
            <TableCell>
              <TicketPriorityBadge priority={ticket.priority} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {ticket.category?.name ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              <PersonLabel person={ticket.assignee} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {dateFormat.format(new Date(ticket.createdAt))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
