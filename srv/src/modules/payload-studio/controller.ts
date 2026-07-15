import type { Request, Response } from "express";
import { payloadStudioService } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";

/** HTTP handlers for Payload Studio. Thin: parse request, call the service, shape response. */

/** GET /:messageId — the composed Payload Studio payload for a message. */
export async function getStudio(req: Request, res: Response): Promise<void> {
  const messageId = req.params.messageId as string;
  const studio = await payloadStudioService.getStudio(messageId);
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
