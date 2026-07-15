import type { Request, Response } from "express";
import { messageReplayService } from "./service.js";
import { auditLog } from "../../core/logging/logger.js";

/**
 * HTTP handlers for the Message Replay module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Message Replay rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await messageReplayService.list(req.operationsEngine, req.query));
}
/**
 * POST /:messageId/replay — executes the replay action.
 * @param req the request.
 * @param res the response.
 */
export async function replay(req: Request, res: Response): Promise<void> {
  const messageId = req.params.messageId ?? "";
  const result = await messageReplayService.replay(req.operationsEngine, messageId, req.correlationId);
  auditLog(req.correlationId, {
    actor: req.security?.userId ?? "unknown",
    action: "message-replay.replay",
    target: messageId,
  });
  res.json(result);
}
