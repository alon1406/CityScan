/* =============================================
   Core demo vault — localStorage standing in for the server.

   This has no counterpart in SmartCollect, which always had a backend to talk to.
   It sits in core/ rather than services/ for the same reason session.ts does: it is
   a storage mechanism, not a domain. Services decide *what* a hazard is; this file
   only knows how to keep records and hand them back.

   Everything here is deleted in one piece once the backend is deployed — which is
   precisely why it is one file and not a set of `if (IS_DEMO)` branches scattered
   through the services.
   ============================================= */

import { IS_DEMO } from './config'
import { buildDemoHazards } from '../data/demoFixtures'
// Type-only, so it is erased at compile time and creates no runtime import cycle
// with hazardService — which does import this module for real.
import type { Hazard } from '../services/hazardService'
import type { SessionUser } from './session'

const DEMO_VAULT_KEY = 'demo_vault'

/** The identities the demo signs visitors in as. Shared by authService and hazardService. */
export const MOCK_DEMO_USER: SessionUser = {
  _id: 'demo-user-id',
  email: 'demo@cityscan.demo',
  name: 'Demo User',
  role: 'user',
}
export const MOCK_DEMO_ADMIN: SessionUser = {
  _id: 'demo-admin-id',
  email: 'admin-demo@cityscan.demo',
  name: 'Demo Admin',
  role: 'admin',
}

interface DemoVault {
  hazards: Record<string, Hazard | null>
}

/**
 * Reads the vault, seeding it from the bundled fixtures on a visitor's first load.
 *
 * Seeding happens **only when the key is absent**, never when it merely parses to an
 * empty set. A visitor who deletes every hazard leaves entries explicitly set to `null`,
 * so the key exists and must not be re-seeded — otherwise deleting a report would appear
 * to do nothing. Deletions persist for that browser; a fresh browser gets the full set.
 * Same semantics as the backend's nightly reset.
 */
export function getDemoVault(): DemoVault {
  try {
    const raw = localStorage.getItem(DEMO_VAULT_KEY)

    if (raw === null) {
      if (!IS_DEMO) return { hazards: {} }
      const seeded: DemoVault = { hazards: buildDemoHazards() }
      setDemoVault(seeded)
      return seeded
    }

    const parsed = JSON.parse(raw) as DemoVault
    return { hazards: parsed.hazards ?? {} }
  } catch {
    return { hazards: {} }
  }
}

export function setDemoVault(vault: DemoVault): void {
  localStorage.setItem(DEMO_VAULT_KEY, JSON.stringify(vault))
}

/**
 * What each endpoint would have filtered server-side.
 *
 * Demo mode has to reproduce it locally, because the query string is built and then
 * never sent anywhere. Without this the map showed resolved hazards and the
 * "already reported here" popup listed every hazard in the city.
 */
export interface DemoQuery {
  where?: (h: Hazard) => boolean
  limit?: number | undefined
}

/** In demo mode: use only demo_vault (no backend calls, so no 429). When not demo, call API and merge with vault. */
export async function getHazardsWithDemoMerge(
  fetchFn: () => Promise<Hazard[]>,
  demo?: DemoQuery
): Promise<Hazard[]> {
  if (IS_DEMO) {
    let list = Object.values(getDemoVault().hazards).filter((h): h is Hazard => h !== null)
    if (demo?.where) list = list.filter(demo.where)
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) // newest first, as the API does
    return demo?.limit ? list.slice(0, demo.limit) : list
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
