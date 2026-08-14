/* =============================================
   Auth service — /auth/login, /auth/demo-login, /auth/register.

   The counterpart of SmartCollect's `userService.js`, and named the same way: after
   the boundary it talks to on the server. `backend/src/boundaries/` defines the wire
   contract; this file is the browser's half of it.
   ============================================= */

import { api } from '../core/http'
import { IS_DEMO } from '../core/config'
import { MOCK_DEMO_USER, MOCK_DEMO_ADMIN } from '../core/demoVault'
import type { SessionUser } from '../core/session'

export type LoginResponse = { token: string; user: SessionUser }
export type RegisterResponse = LoginResponse

export async function login(email: string, password: string): Promise<LoginResponse> {
  if (IS_DEMO) {
    return Promise.resolve({ token: 'demo-token', user: MOCK_DEMO_USER })
  }
  return api.post<LoginResponse>('/auth/login', { email, password })
}

/** Sign in as demo admin or user (backend creates account if needed). */
export async function demoLogin(role: 'admin' | 'user'): Promise<LoginResponse> {
  if (IS_DEMO) {
    const user = role === 'admin' ? MOCK_DEMO_ADMIN : MOCK_DEMO_USER
    return Promise.resolve({ token: 'demo-token', user })
  }
  return api.post<LoginResponse>('/auth/demo-login', { role })
}

export async function register(email: string, password: string, name?: string): Promise<RegisterResponse> {
  if (IS_DEMO) {
    return Promise.resolve({ token: 'demo-token', user: { ...MOCK_DEMO_USER, email, name } })
  }
  return api.post<RegisterResponse>('/auth/register', { email, password, name })
}
