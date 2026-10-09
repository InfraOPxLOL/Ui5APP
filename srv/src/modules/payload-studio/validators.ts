import { z } from "zod";

/** Path-parameter schema for the studio composite endpoint. */
export const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

/** Optional JMS message whose broker body the studio should show — both fields, or neither. */
export const studioQuerySchema = z
  .object({
    jmsQueue: z.string().trim().min(1).max(200).optional(),
    jmsMessageId: z.string().trim().min(1).max(500).optional(),
    interchangeId: z.string().trim().min(1).max(120).optional(),
  })
  .refine((query) => (query.jmsQueue === undefined) === (query.jmsMessageId === undefined), {
    message: "jmsQueue and jmsMessageId must be given together.",
  });

/** Path-parameter schema for the attachment download endpoint. */
export const attachmentParamSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
});
