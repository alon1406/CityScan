import type {
  AiService,
  DuplicateCheckResult,
  ExistingHazardForAi,
  NewReportForAi,
} from '../ai.service.js';
import { config } from '../../config/env.js';

/**
 * Talks to the Python FastAPI ai-service, which fronts Google Gemini.
 *
 * The name says Gemini because that is what the current ai-service uses; swapping to
 * Groq or another free tier in Phase 3 means adding a sibling impl and changing one
 * line in `container.ts`, not editing `HazardsServiceImpl`.
 *
 * Two things are different from the code this replaces. The URL and API key are read
 * from `config` at call time instead of `process.env` at module load — that module-scope
 * read happened before `dotenv.config()` ran, so `AI_SERVICE_URL` was always undefined
 * and every AI call silently no-opped. And failures are now logged loudly rather than
 * disappearing into a returned `false`.
 */
const NOT_CHECKED: DuplicateCheckResult = {
  isDuplicate: false,
  matchingHazardId: null,
  aiChecked: false,
};

export class GeminiAiServiceImpl implements AiService {
  get enabled(): boolean {
    return config.ai.enabled;
  }

  async checkDuplicate(
    existing: ExistingHazardForAi[],
    newReport: NewReportForAi
  ): Promise<DuplicateCheckResult> {
    if (!config.ai.url || existing.length === 0) return NOT_CHECKED;

    try {
      const res = await fetch(`${config.ai.url}/check-duplicate`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          existing_hazards: existing.map((h) => ({
            _id: h._id,
            type: h.type,
            status: h.status,
            ...(h.description != null && { description: h.description }),
          })),
          new_report: {
            type: newReport.type,
            ...(newReport.description && { description: newReport.description }),
            ...(newReport.address && { address: newReport.address }),
          },
        }),
        signal: AbortSignal.timeout(config.ai.timeoutMs),
      });

      if (!res.ok) {
        console.warn(`AI check-duplicate returned ${res.status}: ${await res.text()}`);
        return NOT_CHECKED;
      }

      const data = (await res.json()) as {
        is_duplicate?: boolean;
        matching_hazard_id?: string | null;
      };

      const isDuplicate = Boolean(data.is_duplicate);
      // Only trust an id the service was actually given — never echo back an arbitrary
      // identifier from an external process into our response.
      const matchingHazardId =
        isDuplicate &&
        data.matching_hazard_id &&
        existing.some((h) => h._id === data.matching_hazard_id)
          ? data.matching_hazard_id
          : null;

      return { isDuplicate, matchingHazardId, aiChecked: true };
    } catch (err) {
      console.warn('AI check-duplicate failed, allowing the report through:', describe(err));
      return NOT_CHECKED;
    }
  }

  async describePhoto(imageBase64: string): Promise<string | null> {
    if (!config.ai.url || !imageBase64.trim()) return null;

    try {
      const res = await fetch(`${config.ai.url}/analyze`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ image: imageBase64 }),
        signal: AbortSignal.timeout(config.ai.analyzeTimeoutMs),
      });

      if (!res.ok) {
        console.warn(`AI analyze returned ${res.status}`);
        return null;
      }

      const data = (await res.json()) as { description?: string };
      return typeof data.description === 'string' ? data.description.trim() : null;
    } catch (err) {
      console.warn('AI analyze failed:', describe(err));
      return null;
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.ai.apiKey) headers['X-API-Key'] = config.ai.apiKey;
    return headers;
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'TimeoutError' || err.name === 'AbortError' ? 'request timed out' : err.message;
  }
  return String(err);
}
