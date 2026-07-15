import type { Request, Response } from "express";
import { coeDlqService } from "./service.js";

/** HTTP handlers for the DLQ & Intelligent Recovery Dashboard. Thin: parse request, call the service. */

/** GET / — the failed-message master list. */
export async function listFailedMessages(_req: Request, res: Response): Promise<void> {
  res.json(await coeDlqService.listFailedMessages());
}

/** GET /:messageId/recovery — the recovery context (queue resolution + error details) for a message. */
export async function getRecovery(req: Request, res: Response): Promise<void> {
  res.json(await coeDlqService.getRecovery(req.params.messageId as string));
}

/** POST /:messageId/replay — attempts a replay (resolves the target queue). */
export async function replay(req: Request, res: Response): Promise<void> {
  res.json(await coeDlqService.replay(req.params.messageId as string));
}
