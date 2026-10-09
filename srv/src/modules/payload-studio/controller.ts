import type { Request, Response } from "express";
import { payloadStudioService } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";

/** HTTP handlers for Payload Studio. Thin: parse request, call the service, shape response. */

/**
 * GET /:messageId[?jmsQueue=&jmsMessageId=|?interchangeId=] — the composed Payload Studio payload
 * for a message; with the JMS pair the queued message's body is shown, with an interchange id that
 * interchange's received and sent documents.
 */
export async function getStudio(req: Request, res: Response): Promise<void> {
  const messageId = req.params.messageId as string;
  const jmsQueue = req.query.jmsQueue as string | undefined;
  const jmsMessageId = req.query.jmsMessageId as string | undefined;
  const studio = await payloadStudioService.getStudio(messageId, {
    jms:
      jmsQueue === undefined || jmsMessageId === undefined
        ? undefined
        : { queueName: jmsQueue, messageId: jmsMessageId },
    interchangeId: req.query.interchangeId as string | undefined,
  });
  if (studio === undefined) {
    throw HttpError.notFound(`No message found with id "${messageId}".`);
  }
  res.json(studio);
}

/** GET /:messageId/attachments/:attachmentId/download — downloads one attachment. */
export async function downloadAttachment(req: Request, res: Response): Promise<void> {
  const messageId = req.params.messageId as string;
  const attachmentId = req.params.attachmentId as string;
  const model = await payloadStudioService.downloadAttachment(messageId, attachmentId);
  if (model === undefined) {
    throw HttpError.notFound(`No attachment "${attachmentId}" found for message "${messageId}".`);
  }
  res.setHeader("Content-Type", model.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${model.fileName}"`);
  res.send(Buffer.from(model.contentBase64, "base64"));
}
