import { z } from "zod";

const queueName = z.string().trim().min(1).max(200);
const messageId = z.string().trim().min(1).max(200);

export const listQuerySchema = z.object({
  /** Restrict to one dead-letter queue; omitted means all configured TPM dead-letter queues. */
  queue: queueName.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

export const messageIdParamSchema = z.object({ messageId });

export const detailQuerySchema = z.object({ queue: queueName });

export const retryBodySchema = z.object({
  queueName,
  reason: z.string().trim().max(500).optional(),
});

export const bulkRetryBodySchema = z.object({
  items: z.array(z.object({ messageId, queueName })).min(1).max(50),
  reason: z.string().trim().max(500).optional(),
});
