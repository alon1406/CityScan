/**
 * The AI service seen from the business layer.
 *
 * Deliberately an interface with `gemini.ai.service.impl.ts` behind it: Phase 3 calls
 * for swapping in a free LLM tier (Groq, or Gemini's free route) and that must not
 * require touching `HazardsServiceImpl`. This is the same interface-first discipline
 * SmartCollect applies to every service in `logic/`.
 */
export interface AiService {
  /** True when the service is configured. False means callers degrade to geo-only matching. */
  readonly enabled: boolean;

  /**
   * Ask whether `newReport` describes a hazard already present in `existing`.
   *
   * Fails open by contract: any transport or provider failure resolves to
   * `{ isDuplicate: false, aiChecked: false }` rather than rejecting, so a broken AI
   * service can never stop a citizen from filing a report.
   */
  checkDuplicate(
    existing: ExistingHazardForAi[],
    newReport: NewReportForAi
  ): Promise<DuplicateCheckResult>;

  /** Describe a hazard photo. Returns null when unavailable. */
  describePhoto(imageBase64: string): Promise<string | null>;
}

export interface ExistingHazardForAi {
  _id: string;
  type: string;
  status: string;
  description?: string | undefined;
}

export interface NewReportForAi {
  type: string;
  description?: string | undefined;
  address?: string | undefined;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingHazardId: string | null;
  /** True only when the service was actually reached and answered. */
  aiChecked: boolean;
}
