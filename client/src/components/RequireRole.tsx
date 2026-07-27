import { Navigate, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { fetchMe, hasRole, type Role } from '@/lib/me'

/**
 * Layout route that only renders its children for users holding `role`.
 *
 * The decision comes from GET /api/me, so the role is read from the database rather
 * than trusted from the client. This still only controls *navigation* — it hides a
 * route, it does not protect data. Any endpoint the guarded pages call needs its own
 * server-side role check.
 */
export function RequireRole({ role }: { role: Role }) {
  const location = useLocation()

  const { data: me, isPending, isError } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  })

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking your access…</span>
      </div>
    )
  }

  // Signed out (or the check failed) — send them to log in, remembering where they
  // were so a redirect back is possible later.
  if (isError || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!hasRole(me, role)) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">Not available</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You don't have permission to view this page. Ask an admin in your workspace if
          you think you should.
        </p>
      </div>
    )
  }

  return <Outlet />
}
