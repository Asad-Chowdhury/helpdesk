import 'dotenv/config'

/**
 * Single source for the ports Playwright boots the app on, shared by the config and the
 * tests.
 *
 * `baseURL` is the *web* app, so a bare `request.get('/api/me')` would hit Vite's SPA
 * fallback and get 200 + HTML instead of reaching the API at all — a silent false pass.
 * Anything talking to the API must use API_URL explicitly.
 */
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3001)
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174)

export const API_URL = `http://localhost:${API_PORT}`
export const WEB_URL = `http://localhost:${WEB_PORT}`

/** API paths that change state need this or Better Auth rejects them as CSRF. */
export const API_HEADERS = {
  'Content-Type': 'application/json',
  Origin: WEB_URL,
}
