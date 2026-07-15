import { z } from "zod";
import { paginationQuerySchema } from "../../core/http/pagination.js";

/**
 * Request validation schemas for the Dashboard module. Applied at the route boundary via
 * `validateRequest` before any service runs.
 */

/** Query schema for the list endpoint (paging/sorting/filtering). */
export const listQuerySchema = paginationQuerySchema;

/** Query schema for the summary endpoint. */
export const summaryQuerySchema = z.object({
  tenantId: z.string().optional(),
});
