/* =============================================
   Core config — environment-derived constants.

   Mirrors SmartCollect's `static/js/core/config.js`. The rule that folder follows,
   and this one keeps: **core/ knows nothing about the domain.** No hazard types, no
   status values, no radius. Those live with the service that owns them. What is here
   is only what every layer needs to reach the outside world.
   ============================================= */

/** Backend origin. Overridden per environment via VITE_API_URL. */
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

/** AI service base URL (no trailing slash). Only reached directly in local dev. */
export const AI_SERVICE_BASE = (
  import.meta.env.VITE_AI_SERVICE_URL ?? 'http://localhost:8001'
).replace(/\/$/, '')

/**
 * When true the app runs with no backend at all: every mutation goes to the demo
 * vault in localStorage and every read comes back from it.
 *
 * This is what the public Vercel deployment runs on. Note that anything prefixed
 * `VITE_` is inlined into the shipped bundle, so this flag is public — which is fine,
 * it is a mode switch, not a secret.
 */
export const IS_DEMO =
  import.meta.env.VITE_IS_DEMO === 'true' || import.meta.env.VITE_IS_DEMO === true
