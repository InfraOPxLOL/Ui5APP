import { z } from "zod";

/**
 * Request validation schemas for the Recovery Center module, applied at the route boundary via
 * `validateRequest` before any service runs.
 */

/** Path-parameter schema for endpoints keyed by a dead-letter/retry queue name. */
export const sourceQueueParamSchema = z.object({
  sourceQueue: z.string().min(1),
});

/** Path-parameter schema for endpoints keyed by a recovery id. */
export const recoveryIdParamSchema = z.object({
  recoveryId: z.string().min(1),
});

/** Body schema for `POST /:sourceQueue/recover`. */
export const recoverBodySchema = z.object({
  messageIds: z.array(z.string().min(1)).optional(),
  dryRun: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

/** Query schema for the Recovery History list endpoint. */
export const historyQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).optional(),
  top: z.coerce.number().int().min(1).max(200).optional(),
});
