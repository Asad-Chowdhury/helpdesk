import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { authClient, useSession } from '@/lib/auth-client'

export function Navbar() {
  const { data: session, isPending, refetch } = useSession()

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

        {/* Held empty until the session resolves, so the buttons don't flash the
            signed-out state for an already-signed-in user. */}
        <div className="flex items-center gap-2">
          {isPending ? null : session ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {session.user.email}
              </span>
              <Button
                variant="outline"
                onClick={async () => {
                  await authClient.signOut()
                  refetch()
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link to="/login" />}>
                Log in
              </Button>
              <Button render={<Link to="/signup" />}>Sign up</Button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
