// Base URL of the backend API. Set VITE_API_URL in the client's .env to override.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
