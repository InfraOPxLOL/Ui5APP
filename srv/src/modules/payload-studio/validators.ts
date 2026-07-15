import { z } from "zod";

/** Path-parameter schema for the studio composite endpoint. */
export const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

/** Path-parameter schema for the attachment download endpoint. */
export const attachmentParamSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
});
