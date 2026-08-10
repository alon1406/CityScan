import { z } from 'zod';
import { optionalText } from './common.boundary.js';

/**
 * User DTOs.
 *
 * Note the SmartCollect split between a request type that carries a password and a
 * response type that has nowhere to put one: `UserBoundary` simply has no `password`
 * field, so it cannot leak even if a caller hands the converter a document that still
 * has the hash loaded.
 */

const MAX_NAME = 200;

export const updateMeSchema = z
  .object({
    name: optionalText(MAX_NAME),
    email: z.email('Valid email is required').trim().toLowerCase().optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: 'Provide at least one of: name, email',
  });
export type UpdateMeBoundary = z.infer<typeof updateMeSchema>;

/** Must stay compatible with `LoginResponse['user']` in frontend/src/api/client.ts. */
export interface UserBoundary {
  _id: string;
  email: string;
  name?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

/** The trimmed form embedded inside a hazard. */
export interface UserRefBoundary {
  _id: string;
  email: string;
  name?: string;
}
