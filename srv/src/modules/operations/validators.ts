import { z } from "zod";

/**
 * Request validation schemas for the Operations module, applied at the route boundary via
 * `validateRequest` before the service runs.
 */

/** Query schema for the overview endpoint. `windowHours` is bounded to a week. */
export const overviewQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).optional(),
  tenantId: z.string().optional(),
});

/** Query schema for the workspace search endpoint. */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  tenantId: z.string().optional(),
});
