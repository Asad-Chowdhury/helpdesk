import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketFilters as Filters,
  type TicketFormOptions,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
} from '@/lib/tickets'

type Props = {
  filters: Filters
  onChange: (next: Filters) => void
  options: TicketFormOptions | undefined
  /**
   * False for Staff and Clients, who only ever see their own slice of the queue — the
   * assignee filter is meaningless to them, since every value but themselves matches
   * nothing. The server enforces the scope regardless.
   */
  showAssigneeFilter?: boolean
}

const SORT_LABELS: Record<TicketSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  priority: 'Priority',
  updated: 'Recently updated',
}

/**
 * The sentinel for "no filter" in a Select.
 *
 * A Base UI Select item needs a string value, and '' is indistinguishable from unset once
 * it round-trips through the URL, so the cleared option carries this instead and is mapped
 * back to `undefined` before the filter object is built.
 */
const ANY = '__any__'

/**
 * Base UI's `onValueChange` can hand back null (it clears the value when an item is
 * deselected), which means the same thing as the ANY option here: no filter.
 */
function chosen(value: string | null): string | undefined {
  return value === null || value === ANY ? undefined : value
}

/**
 * Queue filters. Single-select per dimension for now — the server accepts repeated status
 * and priority values (`?status=OPEN&status=RESOLVED`), so multi-select is a UI change here
 * with no API work, but one value covers the common "show me the open ones" case without a
 * custom multi-select control.
 *
 * Every change replaces the whole filter object and resets to page 1: keeping page 3 while
 * narrowing a filter usually lands on an empty page, which reads as "no results".
 */
export function TicketFilters({
  filters,
  onChange,
  options,
  showAssigneeFilter = true,
}: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch, page: 1 })

  const assigneeItems: Record<string, string> = {
    [ANY]: 'Anyone',
    unassigned: 'Unassigned',
    ...Object.fromEntries((options?.assignees ?? []).map((a) => [a.id, a.name])),
  }

  const categoryItems: Record<string, string> = {
    [ANY]: 'Any category',
    ...Object.fromEntries((options?.categories ?? []).map((c) => [c.id, c.name])),
  }

  const statusItems: Record<string, string> = { [ANY]: 'Any status', ...STATUS_LABELS }
  const priorityItems: Record<string, string> = { [ANY]: 'Any priority', ...PRIORITY_LABELS }

  const isFiltered = Boolean(
    filters.q || filters.status?.length || filters.priority?.length || filters.categoryId || filters.assigneeId,
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search tickets"
          placeholder="Search subject, description or #number"
          className="pl-8"
          value={filters.q ?? ''}
          onChange={(event) => set({ q: event.target.value })}
        />
      </div>

      <Select
        items={statusItems}
        value={filters.status?.[0] ?? ANY}
        onValueChange={(value) => {
          const next = chosen(value)
          set({ status: next ? [next as TicketStatus] : undefined })
        }}
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {TICKET_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={priorityItems}
        value={filters.priority?.[0] ?? ANY}
        onValueChange={(value) => {
          const next = chosen(value)
          set({ priority: next ? [next as TicketPriority] : undefined })
        }}
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Filter by priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any priority</SelectItem>
          {TICKET_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={categoryItems}
        value={filters.categoryId ?? ANY}
        onValueChange={(value) => set({ categoryId: chosen(value) })}
      >
        <SelectTrigger size="sm" className="w-40" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any category</SelectItem>
          {(options?.categories ?? []).map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showAssigneeFilter && (
      <Select
        items={assigneeItems}
        value={filters.assigneeId ?? ANY}
        onValueChange={(value) => set({ assigneeId: chosen(value) })}
      >
        <SelectTrigger size="sm" className="w-40" aria-label="Filter by assignee">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Anyone</SelectItem>
          {/* 'unassigned' is a server-side sentinel, not a user id — a plain id filter
              cannot express "nobody is on this". */}
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {(options?.assignees ?? []).map((assignee) => (
            <SelectItem key={assignee.id} value={assignee.id}>
              {assignee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      )}

      <Select
        items={SORT_LABELS}
        value={filters.sort ?? 'newest'}
        onValueChange={(value) => set({ sort: value as TicketSort })}
      >
        <SelectTrigger size="sm" className="w-44" aria-label="Sort tickets">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as TicketSort[]).map((sort) => (
            <SelectItem key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ sort: filters.sort, page: 1 })}
        >
          <X />
          Clear
        </Button>
      )}
    </div>
  )
}
