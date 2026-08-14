/* =============================================
   Core session — the logged-in user and token in localStorage.

   Mirrors SmartCollect's `static/js/core/session.js`, which exposes a single
   `session` object rather than loose functions.

   This is the **only** module that names the storage keys. Before the split they
   appeared in two places — `getAuthHeader` in the API client and AuthContext — which
   is the kind of duplication that silently breaks a logout.
   ============================================= */

const TOKEN_KEY = 'cityscan_token'
const USER_KEY = 'cityscan_user'
const DEMO_MODE_KEY = 'cityscan_demo'

/** The shape the session persists. The full user boundary lives in authService. */
export interface SessionUser {
  _id: string
  email: string
  name?: string
  role?: 'user' | 'admin'
}

export const session = {
  /** Raw JWT, or null when signed out. */
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),

  getUser: (): SessionUser | null => {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SessionUser
    } catch {
      return null
    }
  },

  /** 'user' | 'admin' | null. */
  getRole: (): SessionUser['role'] | null => session.getUser()?.role ?? null,

  /** True when the visitor signed in through one of the demo buttons. */
  isDemoMode: (): boolean => localStorage.getItem(DEMO_MODE_KEY) === '1',

  save: (token: string, user: SessionUser, demoMode = false): void => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    if (demoMode) localStorage.setItem(DEMO_MODE_KEY, '1')
  },

  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(DEMO_MODE_KEY)
  },
}
