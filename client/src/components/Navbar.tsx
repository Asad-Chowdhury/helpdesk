import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { fetchMe, hasRole } from '@/lib/me'

export function Navbar() {
  const queryClient = useQueryClient()

  // /api/me carries both identity and role, so one request answers "who is this" and
  // "what may they see". Shares its cache with the RequireRole route guard.
  const { data: me, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  })

  const isAdmin = hasRole(me, 'ADMIN')

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight text-foreground"
          aria-label="Helpdesk home"
        >
          Helpdesk
        </Link>

        {/* Auth-dependent items are held empty until the session resolves, so they
            don't flash the signed-out state for an already-signed-in user. */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to="/users"
              className="mr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Users
            </Link>
          )}

          <ThemeToggle />

          {isPending ? null : me ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {me.user.email}
              </span>
              <Button
                variant="outline"
                onClick={async () => {
                  await authClient.signOut()
                  queryClient.invalidateQueries({ queryKey: ['me'] })
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link to="/login" />}>
                Log in
              </Button>
              <Button nativeButton={false} render={<Link to="/signup" />}>Sign up</Button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
