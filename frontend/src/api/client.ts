const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

/** AI service base URL (no trailing slash). Used in demo mode for photo analysis. */
const AI_SERVICE_BASE = (import.meta.env.VITE_AI_SERVICE_URL ?? 'http://localhost:8001').replace(/\/$/, '')

/** When true, all mutations go to localStorage (demo_vault); GETs merge API data with vault. No backend required for demo. Set VITE_IS_DEMO=true in frontend .env (Vite; for CRA use REACT_APP_IS_DEMO and expose it in client). */
export const IS_DEMO =
  import.meta.env.VITE_IS_DEMO === 'true' || import.meta.env.VITE_IS_DEMO === true

const DEMO_VAULT_KEY = 'demo_vault'

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('cityscan_token')
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

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

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: 'DELETE' }),
}

export type LoginResponse = { token: string; user: { _id: string; email: string; name?: string; role?: 'user' | 'admin' } }
export type RegisterResponse = LoginResponse

const MOCK_DEMO_USER = { _id: 'demo-user-id', email: 'demo@cityscan.demo', name: 'Demo User', role: 'user' as const }
const MOCK_DEMO_ADMIN = { _id: 'demo-admin-id', email: 'admin-demo@cityscan.demo', name: 'Demo Admin', role: 'admin' as const }

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

// Hazards API
export type HazardType = 'pothole' | 'broken_streetlight' | 'debris' | 'flooding' | 'other'
export type HazardStatus = 'open' | 'in_progress' | 'resolved'

export interface Hazard {
  _id: string
  type: HazardType
  latitude: number
  longitude: number
  description?: string
  address?: string
  /** Multiple hazard photos (new). For old reports, use getHazardPhotos(h). */
  hazardPhotos?: string[]
  status: HazardStatus
  reportedBy: { _id: string; email: string; name?: string }
  createdAt: string
  updatedAt: string
}

/** Returns array of photo URLs for a hazard (supports old hazardPhoto/areaPhoto and new hazardPhotos). */
export function getHazardPhotos(h: Hazard): string[] {
  if (h.hazardPhotos?.length) return h.hazardPhotos
  const legacy = [(h as { hazardPhoto?: string }).hazardPhoto, (h as { areaPhoto?: string }).areaPhoto].filter(Boolean) as string[]
  return legacy
}

// --- Demo vault: localStorage persistence when IS_DEMO is true ---
interface DemoVault {
  hazards: Record<string, Hazard | null>
}

function getDemoVault(): DemoVault {
  try {
    const raw = localStorage.getItem(DEMO_VAULT_KEY)
    if (!raw) return { hazards: {} }
    const parsed = JSON.parse(raw) as DemoVault
    return { hazards: parsed.hazards ?? {} }
  } catch {
    return { hazards: {} }
  }
}

function setDemoVault(vault: DemoVault): void {
  localStorage.setItem(DEMO_VAULT_KEY, JSON.stringify(vault))
}

/** In demo mode: use only demo_vault (no backend calls, so no 429). When not demo, call API and merge with vault. */
async function getHazardsWithDemoMerge(fetchFn: () => Promise<Hazard[]>): Promise<Hazard[]> {
  if (IS_DEMO) {
    const vault = getDemoVault()
    return Object.values(vault.hazards).filter((h): h is Hazard => h !== null)
  }
  let list: Hazard[]
  try {
    list = await fetchFn()
  } catch {
    list = []
  }
  const vault = getDemoVault()
  const byId = new Map<string, Hazard>()
  for (const h of list) byId.set(h._id, h)
  for (const [id, h] of Object.entries(vault.hazards)) {
    if (h === null) byId.delete(id)
    else byId.set(id, h)
  }
  return Array.from(byId.values())
}

export function fetchHazards(params?: { limit?: number; status?: HazardStatus; type?: HazardType; unsolved?: boolean }): Promise<Hazard[]> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.type) q.set('type', params.type)
  if (params?.unsolved) q.set('unsolved', '1')
  const query = q.toString()
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards${query ? `?${query}` : ''}`))
}

/** Fetches hazards reported by the current user (requires auth). */
export function fetchMyHazards(params?: { limit?: number }): Promise<Hazard[]> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  const query = q.toString()
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards/mine${query ? `?${query}` : ''}`))
}

/** Count of open reports for admin navbar badge (requires auth + admin role). */
export function fetchAdminNewReportsCount(): Promise<{ count: number }> {
  if (IS_DEMO) {
    const vault = getDemoVault()
    const count = Object.values(vault.hazards).filter((h) => h?.status === 'open').length
    return Promise.resolve({ count })
  }
  return api.get<{ count: number }>('/hazards/admin/count')
}

/** Fetches all hazards for admin with filters (requires auth + admin role). */
export function fetchAdminHazards(params?: {
  limit?: number
  status?: HazardStatus
  type?: HazardType
  search?: string
}): Promise<Hazard[]> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.type) q.set('type', params.type)
  if (params?.search?.trim()) q.set('search', params.search.trim())
  const query = q.toString()
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards/admin/list${query ? `?${query}` : ''}`))
}

/** Update hazard (status, description). Reporter or admin. */
export function updateHazard(id: string, data: { status?: HazardStatus; description?: string }): Promise<Hazard> {
  if (IS_DEMO) {
    const vault = getDemoVault()
    const existing = vault.hazards[id]
    if (existing) {
      const updated: Hazard = { ...existing, ...data, updatedAt: new Date().toISOString() }
      vault.hazards[id] = updated
      setDemoVault(vault)
      return Promise.resolve(updated)
    }
    return Promise.reject(new Error('Hazard not found'))
  }
  return api.patch<Hazard>(`/hazards/${id}`, data)
}

/** Get AI description for a hazard photo. Uses backend proxy when available (keeps API key server-side); falls back to direct AI service for local dev. */
export async function analyzeHazardPhoto(imageBase64: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeader() }
  const body = JSON.stringify({ image: imageBase64 })

  const proxyRes = await fetch(`${API_BASE}/hazards/analyze-photo`, { method: 'POST', headers, body }).catch(() => null)
  if (proxyRes?.ok) {
    const data = (await proxyRes.json().catch(() => ({}))) as { description?: string }
    return (data.description ?? '').trim()
  }

  const directRes = await fetch(`${AI_SERVICE_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => null)
  if (directRes?.ok) {
    const data = (await directRes.json().catch(() => ({}))) as { description?: string }
    return (data.description ?? '').trim()
  }

  const lastRes = proxyRes ?? directRes
  const data = (await lastRes?.json().catch(() => ({}))) as { detail?: string; message?: string }
  const msg = data.detail ?? data.message ?? (lastRes ? `AI service error ${lastRes.status}` : 'Cannot reach AI service. Is it running?')
  throw new Error(msg)
}

export function createHazard(data: {
  type: HazardType
  latitude: number
  longitude: number
  description?: string
  address?: string
  hazardPhotos?: string[]
}): Promise<Hazard> {
  if (IS_DEMO) {
    return (async () => {
      let description = data.description?.trim() ?? ''
      if (data.hazardPhotos?.length) {
        try {
          const aiDesc = await analyzeHazardPhoto(data.hazardPhotos[0])
          if (aiDesc) description = description ? `${description}\n\n${aiDesc}` : aiDesc
        } catch {
          // keep existing description if AI fails
        }
      }
      const now = new Date().toISOString()
      const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const user = MOCK_DEMO_USER
      const hazard: Hazard = {
        _id: id,
        ...data,
        description: description || undefined,
        status: 'open',
        reportedBy: { _id: user._id, email: user.email, name: user.name },
        createdAt: now,
        updatedAt: now,
      }
      const vault = getDemoVault()
      vault.hazards[id] = hazard
      setDemoVault(vault)
      return hazard
    })()
  }
  return api.post<Hazard>('/hazards', data)
}

export function fetchNearbyHazards(latitude: number, longitude: number, radiusMeters = 50): Promise<Hazard[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusMeters: String(radiusMeters),
  })
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards/nearby?${params}`))
}

export interface CheckSameHazardResponse {
  isDuplicate: boolean
  matchingHazardId?: string
}

export function checkSameHazard(data: {
  type: HazardType
  description?: string
  latitude: number
  longitude: number
  address?: string
}): Promise<CheckSameHazardResponse> {
  if (IS_DEMO) return Promise.resolve({ isDuplicate: false })
  return api.post<CheckSameHazardResponse>('/hazards/check-same-hazard', data)
}
