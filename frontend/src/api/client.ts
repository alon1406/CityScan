/* =============================================
   TEMPORARY re-export barrel.

   The contents of this file moved into core/ and services/, matching SmartCollect's
   static/js layout. It stays for one commit only, so that the move can be proved
   correct before any consumer is touched: if the build and the demo still pass here,
   nothing was lost in transit.

   The next commit repoints the eight importers and deletes this file. Import from
   core/ and services/ directly — not from here.
   ============================================= */

export { IS_DEMO } from '../core/config'
export { apiFetch, api, getAuthHeader } from '../core/http'
export { session, type SessionUser } from '../core/session'

export { login, demoLogin, register, type LoginResponse, type RegisterResponse } from '../services/authService'
export { analyzeHazardPhoto } from '../services/aiService'
export {
  UNRESOLVED,
  DUPLICATE_RADIUS_METERS,
  distanceMeters,
  getHazardPhotos,
  fetchHazards,
  fetchMyHazards,
  fetchAdminNewReportsCount,
  fetchAdminHazards,
  updateHazard,
  createHazard,
  fetchNearbyHazards,
  checkSameHazard,
  type Hazard,
  type HazardType,
  type HazardStatus,
  type CheckSameHazardResponse,
} from '../services/hazardService'
