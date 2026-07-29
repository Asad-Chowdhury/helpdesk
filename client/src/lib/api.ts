import axios from 'axios'

// Base URL of the backend API. Set VITE_API_URL in the client's .env to override.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * The single HTTP client for our own API.
 *
 * `withCredentials` is the axios equivalent of fetch's `credentials: 'include'` and is
 * what carries the Better Auth session cookie cross-origin — the client and server sit
 * on different ports, so without it every request is anonymous.
 *
 * Better Auth's own calls (`authClient.signIn`/`signOut`) do not go through here; that
 * SDK ships its own fetch layer and is configured separately in auth-client.ts.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

/** The server's error envelope — see the routes under server/src/routes. */
type ApiErrorBody = { error?: string; fields?: Record<string, string> }

/**
 * Normalises a thrown axios error into the parts we act on.
 *
 * Unlike fetch, axios rejects on any non-2xx, so a status the caller treats as a valid
 * answer (401 from /api/me, say) arrives here as an exception and has to be read back
 * off `status`. A network failure has no response at all, hence the optional status.
 */
export function readApiError(
  err: unknown,
  fallback: string,
): { message: string; fields: Record<string, string>; status?: number } {
  if (!axios.isAxiosError<ApiErrorBody>(err)) {
    // Not an HTTP failure — a bug in our own code, and not ours to relabel.
    throw err
  }

  const status = err.response?.status
  const body = err.response?.data

  return {
    message: body?.error ?? (status ? `${fallback} (${status})` : err.message),
    fields: body?.fields ?? {},
    status,
  }
}
