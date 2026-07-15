import { z } from "zod";
import { paginationQuerySchema } from "../../core/http/pagination.js";

/**
 * Request validation schemas for the JMS Queues module. Applied at the route boundary via
 * `validateRequest` before any service runs.
 */

/** Query schema for the list endpoint (paging/sorting/filtering). */
export const listQuerySchema = paginationQuerySchema;

/** Params schema for the purge action. */
export const purgeParamsSchema = z.object({
  queueName: z.string().min(1),
});
