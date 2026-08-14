/* =============================================
   AI service — /hazards/analyze-photo, falling back to the ai-service directly.

   The counterpart of SmartCollect's `commandService.js`: the smallest service, one
   job, wrapping the endpoint that makes the server do something rather than return
   a record.
   ============================================= */

import { API_BASE, AI_SERVICE_BASE, IS_DEMO } from '../core/config'
import { getAuthHeader } from '../core/http'

/**
 * Get an AI description for a hazard photo.
 *
 * Prefers the backend proxy, which holds the Gemini key server-side; falls back to
 * calling the ai-service directly, which is only reachable in local development.
 */
export async function analyzeHazardPhoto(imageBase64: string): Promise<string> {
  // Photo analysis needs the Gemini key, and a key in a Vite bundle is a published
  // key — everything prefixed VITE_ is inlined into the shipped JavaScript. So the
  // browser-only demo cannot do this, and says so instead of firing two requests at
  // a backend that is not deployed and appearing to hang.
  if (IS_DEMO) {
    throw new Error('AI photo analysis runs on the server and is unavailable in the browser demo.')
  }

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
