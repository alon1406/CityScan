import { z } from 'zod';
import { HAZARD_TYPES, HAZARD_STATUSES } from '../data/enums.js';
import { config } from '../config/env.js';
import { optionalText } from './common.boundary.js';

/**
 * The hazard DTOs — the outward-facing contract.
 *
 * Each request schema is both the validator and the source of its TypeScript type
 * (`z.infer`), so the two cannot drift. SmartCollect keeps plain POJO boundaries and
 * validates imperatively inside each `ServiceImpl`; its own architecture guide flags
 * that duplication as technical debt, so this collapses the two into one artifact.
 *
 * The response shape is frozen: `frontend/src/api/client.ts` declares `interface Hazard`
 * with exactly these fields, so nothing here may be renamed without changing the client.
 */

const MAX_DESCRIPTION = 2_000;
const MAX_ADDRESS = 500;

/** Latitude/longitude arrive as either numbers or strings depending on the caller. */
const latitude = z.coerce
  .number()
  .refine(Number.isFinite, 'latitude must be a number')
  .min(-90, 'latitude must be between -90 and 90')
  .max(90, 'latitude must be between -90 and 90');

const longitude = z.coerce
  .number()
  .refine(Number.isFinite, 'longitude must be a number')
  .min(-180, 'longitude must be between -180 and 180')
  .max(180, 'longitude must be between -180 and 180');

/**
 * Inbound photos are base64 data URLs. The cap is enforced here and *rejected*, where
 * the old code silently truncated the string mid-image (`hazards.ts:202-209`) and
 * stored a corrupt result.
 */
const photoPayload = z
  .string()
  .min(1)
  .max(config.photos.maxInputBytes, 'Photo is too large — please use a smaller image');

// ---------- Requests ----------

export const createHazardSchema = z.object({
  type: z.enum(HAZARD_TYPES),
  latitude,
  longitude,
  description: optionalText(MAX_DESCRIPTION),
  address: optionalText(MAX_ADDRESS),
  hazardPhotos: z
    .array(photoPayload)
    .max(config.photos.maxCount, `At most ${config.photos.maxCount} photos per report`)
    .optional(),
  status: z.enum(HAZARD_STATUSES).optional(),
});
export type CreateHazardBoundary = z.infer<typeof createHazardSchema>;

export const updateHazardSchema = z
  .object({
    status: z.enum(HAZARD_STATUSES).optional(),
    description: z.string().trim().max(MAX_DESCRIPTION).optional(),
  })
  .refine((v) => v.status !== undefined || v.description !== undefined, {
    message: 'Provide at least one of: status, description',
  });
export type UpdateHazardBoundary = z.infer<typeof updateHazardSchema>;

export const listHazardsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  status: z.enum(HAZARD_STATUSES).optional(),
  type: z.enum(HAZARD_TYPES).optional(),
  unsolved: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});
export type ListHazardsQuery = z.infer<typeof listHazardsQuerySchema>;

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
  status: z.enum(HAZARD_STATUSES).optional(),
  type: z.enum(HAZARD_TYPES).optional(),
  search: optionalText(200),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export const nearbyQuerySchema = z.object({
  latitude,
  longitude,
  radiusMeters: z.coerce.number().min(10).max(500).default(config.hazards.duplicateRadiusMeters),
});
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

export const listMineQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type ListMineQuery = z.infer<typeof listMineQuerySchema>;

export const analyzePhotoSchema = z.object({
  image: photoPayload,
});
export type AnalyzePhotoBoundary = z.infer<typeof analyzePhotoSchema>;

export const checkSameHazardSchema = z.object({
  type: z.enum(HAZARD_TYPES),
  latitude,
  longitude,
  description: optionalText(MAX_DESCRIPTION),
  address: optionalText(MAX_ADDRESS),
});
export type CheckSameHazardBoundary = z.infer<typeof checkSameHazardSchema>;

// ---------- Responses ----------

/** Must stay field-for-field identical to `interface Hazard` in frontend/src/api/client.ts. */
export interface HazardBoundary {
  _id: string;
  type: string;
  latitude: number;
  longitude: number;
  description?: string;
  address?: string;
  /** Public URLs. Previously base64 data URLs; the field name and type are unchanged. */
  hazardPhotos?: string[];
  status: string;
  reportedBy: { _id: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
}

export interface CheckSameHazardResultBoundary {
  isDuplicate: boolean;
  matchingHazardId?: string;
}

export interface AnalyzePhotoResultBoundary {
  description: string;
}

export interface HazardCountBoundary {
  count: number;
}
