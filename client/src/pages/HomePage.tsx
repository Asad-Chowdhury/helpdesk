import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { API_BASE_URL } from '@/lib/api'

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
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-black">Helpdesk</h1>

      <p
        className={
          isError
            ? 'text-destructive'
            : isPending
              ? 'text-muted-foreground'
              : 'text-green-600 dark:text-green-500'
        }
      >
        {message}
      </p>

      <Button onClick={() => refetch()} disabled={isFetching}>
        {isFetching ? 'Checking…' : 'Check again'}
      </Button>
    </div>
  )
}
