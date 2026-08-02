import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Turns whatever was thrown into something worth showing a person.
 *
 * React Router hands this three different shapes depending on where the failure came
 * from, and the difference matters: a 404 from a loader is a normal outcome, a thrown
 * Error is a bug. Each gets its own wording so the page never blames the user for our
 * mistake, or vice versa.
 */
function describe(error: unknown): { title: string; reason: string } {
  // Thrown by a loader/action, or a route that did not match.
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: 'Page not found',
        reason: "That address doesn't match anything in this app. It may have moved, or the link may be wrong.",
      }
    }
    if (error.status === 403) {
      return {
        title: 'Not allowed',
        reason: error.statusText || "You don't have permission to view this page.",
      }
    }
    return {
      title: `Something went wrong (${error.status})`,
      reason: error.statusText || 'The page could not be loaded.',
    }
  }

  // A real exception during render — a bug on our side.
  if (error instanceof Error) {
    return { title: 'Something went wrong', reason: error.message }
  }

  return {
    title: 'Something went wrong',
    reason: 'An unexpected error occurred and the page could not be displayed.',
  }
}

/**
 * The app's last line of defence: a render that throws shows this instead of a blank
 * screen or React Router's developer-facing default.
 *
 * It **names the reason** rather than hiding it. This is an internal tool where the person
 * looking at the error is usually the one who will report it, and "Cannot read properties
 * of undefined" in their screenshot is what makes a bug report actionable. The stack stays
 * behind a disclosure so it informs without dominating.
 *
 * Reloading is offered as the primary action because the common cause is stale client
 * state, which a fresh load clears.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const { title, reason } = describe(error)
  const stack = error instanceof Error ? error.stack : undefined

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-5 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-5 text-destructive" aria-hidden />
        </div>

        {/* role="alert" so the failure is announced, not just drawn. */}
        <div role="alert" className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm break-words text-muted-foreground">{reason}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Back to home
          </Link>
        </div>

        {stack && (
          <details className="pt-2 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted p-3 text-left text-xs whitespace-pre-wrap text-muted-foreground">
              {stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
