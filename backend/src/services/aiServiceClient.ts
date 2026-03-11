/**
 * Client for the external AI service (Python FastAPI).
 * If AI_SERVICE_URL is not set or the request fails, returns isDuplicate: false.
 */

export interface ExistingHazardForAi {
  _id: string;
  type: string;
  status: string;
  description?: string;
}

export interface NewReportForAi {
  type: string;
  description?: string;
  address?: string;
}

export interface CheckResult {
  isDuplicate: boolean;
  matchingHazardId: string | null;
  /** True only when the AI service was called and returned a valid response. */
  aiChecked: boolean;
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, '');
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY?.trim() || '';

function aiServiceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AI_SERVICE_API_KEY) headers['X-API-Key'] = AI_SERVICE_API_KEY;
  return headers;
}

export async function checkSameHazardViaService(
  existingHazards: ExistingHazardForAi[],
  newReport: NewReportForAi
): Promise<CheckResult> {
  if (!AI_SERVICE_URL || existingHazards.length === 0) {
    return { isDuplicate: false, matchingHazardId: null, aiChecked: false };
  }

  try {
    const res = await fetch(`${AI_SERVICE_URL}/check-duplicate`, {
      method: 'POST',
      headers: aiServiceHeaders(),
      body: JSON.stringify({
        existing_hazards: existingHazards.map((h) => ({
          _id: h._id,
          type: h.type,
          status: h.status,
          ...(h.description != null && { description: h.description }),
        })),
        new_report: {
          type: newReport.type,
          ...(newReport.description != null && newReport.description !== '' && { description: newReport.description }),
          ...(newReport.address != null && newReport.address !== '' && { address: newReport.address }),
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error('AI service error:', res.status, await res.text());
      return { isDuplicate: false, matchingHazardId: null, aiChecked: false };
    }

    const data = (await res.json()) as { is_duplicate?: boolean; matching_hazard_id?: string | null };
    const isDuplicate = Boolean(data.is_duplicate);
    const matchingHazardId =
      isDuplicate && data.matching_hazard_id && existingHazards.some((h) => h._id === data.matching_hazard_id)
        ? data.matching_hazard_id
        : null;

    return { isDuplicate, matchingHazardId, aiChecked: true };
  } catch (err) {
    console.error('AI service request failed:', err);
    return { isDuplicate: false, matchingHazardId: null, aiChecked: false };
  }
}

/** Call AI service /analyze with base64 image; returns description or null if unavailable. */
export async function analyzePhotoViaService(imageBase64: string): Promise<string | null> {
  if (!AI_SERVICE_URL || !imageBase64?.trim()) return null;
  try {
    const res = await fetch(`${AI_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: aiServiceHeaders(),
      body: JSON.stringify({ image: imageBase64 }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: string };
    return typeof data.description === 'string' ? data.description.trim() : null;
  } catch (err) {
    console.error('AI service analyze request failed:', err);
    return null;
  }
}
