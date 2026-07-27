import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { API_BASE_URL } from '@/lib/api'
import { fetchMe } from '@/lib/me'

type HealthCheckResponse = {
  status: 'ok'
}

async function fetchHealth(): Promise<HealthCheckResponse> {
  const res = await fetch(`${API_BASE_URL}/api/health`, {
    credentials: 'include', // send/receive cookies for cross-origin session auth
  })
  if (!res.ok) throw new Error(`API request failed (${res.status})`)
  return res.json()
}

export function HomePage() {
  // Same query key as the navbar and route guard, so this is a cache read.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  })

  let message: string
  if (isPending) {
    message = 'Checking API connection…'
  } else if (isError) {
    message = `Could not reach the API: ${error.message}`
  } else {
    message = `API is healthy — status: "${data.status}"`
  }

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Request management for creative teams
          </h1>
          <p className="mx-auto max-w-md text-muted-foreground">
            Intake, triage, and track every request in one place — with SLAs your team
            can actually hit.
          </p>
        </div>

        {!me && (
          <div className="flex items-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
              Create a workspace
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link to="/login" />}>
              Log in
            </Button>
          </div>
        )}
      </main>

      {/* Dev-only signal that the API is reachable; drop this once there's real UI. */}
      <footer className="mx-auto flex w-full max-w-5xl items-center justify-center gap-3 px-6 py-4 text-xs">
        <span className={isError ? 'text-destructive' : 'text-muted-foreground'}>
          {message}
        </span>
        <Button size="xs" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Checking…' : 'Recheck'}
        </Button>
      </footer>
    </div>
  )
}
