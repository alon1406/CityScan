/* =============================================
   Core HTTP — fetch wrapper, auth header, and the shared `api` surface.

   Mirrors SmartCollect's `static/js/core/http.js`, which builds `_handleResponse`,
   `_headers` and an `api` object that every service file attaches its methods onto.

   The difference is mechanical, not architectural: SmartCollect is plain scripts
   loaded in a fixed order, so services extend `api` with `Object.assign(api, {…})`.
   With ES modules each service simply imports `api` and exports its own functions —
   same single point of contact with the network, enforced by the compiler instead of
   by <script> tag ordering.
   ============================================= */

import { API_BASE } from './config'
import { session } from './session'

/** Bearer header, or nothing at all when signed out. */
export function getAuthHeader(): Record<string, string> {
  const token = session.getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * The one place a response is turned into either a value or a thrown Error.
 *
 * The backend writes every error through a single middleware in the same shape,
 * `{ message, status, timestamp, path, code }` — so reading `message` here covers
 * every failure the server can produce.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers as Record<string, string>),
  }
  const res = await fetch(url, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `Request failed: ${res.status}`)
  }
  return data as T
}

/** The shared API surface. Service modules call these; nothing else calls `fetch`. */
export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: 'DELETE' }),
}
