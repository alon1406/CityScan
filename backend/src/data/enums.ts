/**
 * Domain enums, kept here alongside the entities exactly as SmartCollect keeps its
 * enums in the `data` package next to `ObjectEntity` / `UserEntity`.
 *
 * These arrays are the single definition of each value set: the Mongoose schema,
 * the Zod boundary and any runtime check all read from them, so a new hazard type
 * is added in exactly one place.
 */

export const HAZARD_TYPES = [
  'pothole',
  'broken_streetlight',
  'debris',
  'flooding',
  'other',
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const HAZARD_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type HazardStatus = (typeof HAZARD_STATUSES)[number];

/** Statuses that still need attention — what the map shows and what blocks duplicates. */
export const UNRESOLVED_STATUSES: readonly HazardStatus[] = ['open', 'in_progress'];

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
