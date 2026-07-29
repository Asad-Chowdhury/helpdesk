import { Navigate, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { fetchMe } from '@/lib/me'

/**
 * Layout route for pages that need a session but no particular role — the profile page,
 * and anything else every signed-in user may reach.
 *
 * Kept separate from RequireRole rather than folding "no role required" into it: the
 * two answer different questions, and a guard whose check is optional is one prop away
 * from silently guarding nothing.
 *
 * Like RequireRole this controls *navigation only*. Every endpoint these pages call
 * still authenticates for itself — PATCH /api/me takes its target from the session
 * precisely so this component is not what stands between a user and someone else's data.
 */
export function RequireAuth() {
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

  if (isError || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
