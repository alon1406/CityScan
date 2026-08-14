/* =============================================
   Hazard service — /hazards and /hazards/admin/*.

   The counterpart of SmartCollect's `objectService.js`, and follows its shape: a
   service owns its **whole** domain, not only the HTTP calls. There `objectService`
   holds `buildBin` and `binTypeColor` alongside `getAllObjects`; here the hazard
   types, the unresolved-status rule, the duplicate radius and the distance helper sit
   next to the calls that use them.

   That is also why these constants are not in core/config.ts. `core/` is plumbing and
   must stay ignorant of the domain — it should not know what a pothole is.
   ============================================= */

import { api } from '../core/http'
import { IS_DEMO } from '../core/config'
import {
  MOCK_DEMO_USER,
  getDemoVault,
  setDemoVault,
  getHazardsWithDemoMerge,
} from '../core/demoVault'
import { analyzeHazardPhoto } from './aiService'

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

/** Statuses that still count as present on the map, mirroring the backend. */
export const UNRESOLVED: readonly HazardStatus[] = ['open', 'in_progress']

/**
 * Must match `DUPLICATE_RADIUS_METERS` in the backend config. Only used by the
 * demo-mode duplicate check below.
 */
export const DUPLICATE_RADIUS_METERS = 50

/** Great-circle distance in metres. */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_378_100
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Returns array of photo URLs for a hazard (supports old hazardPhoto/areaPhoto and new hazardPhotos). */
export function getHazardPhotos(h: Hazard): string[] {
  if (h.hazardPhotos?.length) return h.hazardPhotos
  const legacy = [(h as { hazardPhoto?: string }).hazardPhoto, (h as { areaPhoto?: string }).areaPhoto].filter(Boolean) as string[]
  return legacy
}

export function fetchHazards(params?: { limit?: number; status?: HazardStatus; type?: HazardType; unsolved?: boolean }): Promise<Hazard[]> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.type) q.set('type', params.type)
  if (params?.unsolved) q.set('unsolved', '1')
  const query = q.toString()
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards${query ? `?${query}` : ''}`), {
    limit: params?.limit,
    where: (h) =>
      (params?.unsolved ? UNRESOLVED.includes(h.status) : !params?.status || h.status === params.status) &&
      (!params?.type || h.type === params.type),
  })
}

/** Fetches hazards reported by the current user (requires auth). */
export function fetchMyHazards(params?: { limit?: number }): Promise<Hazard[]> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  const query = q.toString()
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards/mine${query ? `?${query}` : ''}`), {
    limit: params?.limit,
    // Only what this visitor filed. The seeded fixtures belong to a different author,
    // so "My reports" starts empty and fills as they use the demo — same as the real API.
    where: (h) => h.reportedBy?._id === MOCK_DEMO_USER._id,
  })
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
  return getHazardsWithDemoMerge(() => api.get<Hazard[]>(`/hazards/nearby?${params}`), {
    // The radius filter the backend does with $geoWithin. Without it the demo's
    // "already reported here" popup listed every hazard in the city.
    where: (h) =>
      UNRESOLVED.includes(h.status) &&
      distanceMeters(latitude, longitude, h.latitude, h.longitude) <= radiusMeters,
  })
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
  if (IS_DEMO) {
    // Tier one, run in the browser because the demo has no backend.
    //
    // This deliberately duplicates a business rule that belongs in the server's
    // logic layer — the only place in this codebase that does. It is justified
    // solely because the public demo would otherwise accept duplicate reports and
    // demonstrate nothing, and it is deleted the moment a backend is deployed.
    //
    // Only the deterministic tier is reproducible here. Tier two — the LLM
    // adjudication for nearby hazards of a *different* type — needs the Gemini key,
    // which must never reach the browser. See `analyzeHazardPhoto` for the same
    // reasoning.
    const existing = Object.values(getDemoVault().hazards).filter(
      (h): h is Hazard => h !== null && UNRESOLVED.includes(h.status)
    )

    const match = existing.find(
      (h) =>
        h.type === data.type &&
        distanceMeters(data.latitude, data.longitude, h.latitude, h.longitude) <=
          DUPLICATE_RADIUS_METERS
    )

    return Promise.resolve(
      match ? { isDuplicate: true, matchingHazardId: match._id } : { isDuplicate: false }
    )
  }
  return api.post<CheckSameHazardResponse>('/hazards/check-same-hazard', data)
}
