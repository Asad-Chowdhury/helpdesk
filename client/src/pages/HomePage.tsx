import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Navbar } from '@/components/Navbar'
import { Button, buttonVariants } from '@/components/ui/button'
import { api, readApiError } from '@/lib/api'
import { fetchMe } from '@/lib/me'

type HealthCheckResponse = {
  status: 'ok'
}

async function fetchHealth(): Promise<HealthCheckResponse> {
  try {
    const { data } = await api.get<HealthCheckResponse>('/api/health')
    return data
  } catch (err) {
    throw new Error(readApiError(err, 'API request failed').message)
  }
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
            <Link to="/signup" className={buttonVariants({ size: 'lg' })}>
              Create a workspace
            </Link>
            <Link to="/login" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Log in
            </Link>
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
