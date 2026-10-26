import { z } from "zod";

const queueName = z.string().trim().min(1).max(200);
const messageId = z.string().trim().min(1).max(200);

export const listQuerySchema = z.object({
  /** Which dead-letter queues to list: TPM (`b2b`, the default) or the in-house frameworks. */
  category: z.enum(["b2b", "nonB2b"]).optional(),
  /** Restrict to one dead-letter queue; omitted means all of the category's dead-letter queues. */
  queue: queueName.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

export const messageIdParamSchema = z.object({ messageId });

export const detailQuerySchema = z.object({ queue: queueName });

export const retryBodySchema = z.object({
  queueName,
  /** The queue the operator chose, when the destination could not be determined. */
  targetQueue: queueName.optional(),
  reason: z.string().trim().max(500).optional(),
});

export const bulkRetryBodySchema = z.object({
  items: z
    .array(z.object({ messageId, queueName, targetQueue: queueName.optional() }))
    .min(1)
    .max(50),
  reason: z.string().trim().max(500).optional(),
});
