import { createAuthClient } from 'better-auth/react'
import { API_BASE_URL } from './api'

// Points at the API root — the client appends the /api/auth base path itself.
// Signup is deliberately absent: Better Auth's sign-up endpoint is disabled server-side,
// and new accounts go through POST /api/signup, which also provisions the workspace.
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
})

export const { useSession, signIn, signOut } = authClient
