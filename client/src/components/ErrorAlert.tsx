import type { ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  /** What failed, in the user's terms. Keep it short — the reason carries the detail. */
  title?: string
  /** Why it failed. Prefer the server's own message over a generic one. */
  reason: ReactNode
  /** Rendered under the reason — what the user can do about it. */
  action?: ReactNode
  /** Shown as a "Try again" button when provided. */
  onRetry?: () => void
  className?: string
}

/**
 * The one way this app shows a failure inline.
 *
 * Always `role="alert"`, so a failure that appears after the page has rendered is
 * announced rather than silently drawn — which is the whole point, since almost every
 * error here arrives from a mutation the user just triggered.
 *
 * **Always show the reason.** A bare "Something went wrong" tells the user nothing and
 * tells us nothing when they report it. The server already returns a written-for-humans
 * message in its `{ error }` envelope; that is what belongs here, not a generic string.
 * The title is the category, the reason is the specific.
 */
export function ErrorAlert({ title, reason, action, onRetry, className }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {/* break-words: a server message can contain a long id or URL, and it must not
            push the layout sideways. */}
        <p className="break-words opacity-90">{reason}</p>
        {(action || onRetry) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RefreshCw />
                Try again
              </Button>
            )}
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
