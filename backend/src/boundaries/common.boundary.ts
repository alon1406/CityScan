import { z } from 'zod';

/**
 * A 24-character hex MongoDB ObjectId.
 *
 * Validating this at the boundary turns a malformed id into a clean 400 instead of
 * letting Mongoose throw a CastError deep inside a query — which the old code caught
 * and reported as a 500.
 */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

export const idParamSchema = z.object({ id: objectIdSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** Shared shape for the trimmed-and-dropped-if-empty pattern used across request bodies. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** The error body every failure returns. Documented here because it is a contract. */
export interface ErrorBoundary {
  /** Primary field — the frontend reads `data.message`. Never remove or rename it. */
  message: string;
  status: number;
  timestamp: string;
  path: string;
  /** Machine-readable discriminator, e.g. DUPLICATE_HAZARD. */
  code?: string;
  /** Field-level validation errors. */
  details?: unknown;
  /** Development only. */
  stack?: string;
}
