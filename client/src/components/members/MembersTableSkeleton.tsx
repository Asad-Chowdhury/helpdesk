import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Placeholder for MembersTable while the members query resolves.
 *
 * Deliberately renders the same <Table> with the same six columns and the real
 * headers — those are known before the data arrives, and keeping the structure
 * identical means the rows fill in place instead of the page jumping.
 *
 * The bars are decorative, so the whole table is aria-hidden and the announcement is
 * carried by a sr-only live region instead: a screen reader gets "Loading members…"
 * once, rather than a dozen meaningless empty cells.
 */
export function MembersTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      <span className="sr-only" role="status">
        Loading members…
      </span>

      <div aria-hidden>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  {/* h-7, not h-8: the real role select is size="sm". Matching the
                      control heights is what keeps rows from shifting on load. */}
                  <Skeleton className="h-7 w-32 rounded-lg" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-7 w-24 rounded-lg" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
