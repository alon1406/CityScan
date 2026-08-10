import { z } from 'zod';

export const createLogSchema = z.object({
  action: z.string().trim().min(1, 'action is required').max(100),
  resource: z.string().trim().min(1, 'resource is required').max(100),
  resourceId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, 'resourceId must be a valid id')
    .optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type CreateLogBoundary = z.infer<typeof createLogSchema>;

export const listLogsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  resource: z.string().trim().max(100).optional(),
});
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;

export interface LogBoundary {
  _id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
