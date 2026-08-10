import { z } from 'zod';
import { optionalText } from './common.boundary.js';
import type { UserBoundary } from './user.boundary.js';

/**
 * Auth DTOs. These replace the `express-validator` chains that used to sit inline
 * inside `controllers/auth.ts` and were run by hand at the top of each handler.
 */

const MAX_NAME = 200;
const MIN_PASSWORD = 6;

export const registerSchema = z.object({
  email: z.email('Valid email is required').trim().toLowerCase(),
  password: z
    .string()
    .min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`)
    .max(128, 'Password is too long'),
  name: optionalText(MAX_NAME),
});
export type RegisterBoundary = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('Valid email is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginBoundary = z.infer<typeof loginSchema>;

export const demoLoginSchema = z.object({
  role: z.enum(['admin', 'user'], { message: 'Body must include role: "admin" or "user"' }),
});
export type DemoLoginBoundary = z.infer<typeof demoLoginSchema>;

/** Must stay compatible with `LoginResponse` in frontend/src/api/client.ts. */
export interface TokenBoundary {
  token: string;
  user: UserBoundary;
}
