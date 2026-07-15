import type { Request, Response } from "express";
import { jmsQueueService } from "./service.js";
import { auditLog } from "../../core/logging/logger.js";

/**
 * HTTP handlers for the JMS Queues module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists JMS Queues rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await jmsQueueService.list(req.operationsEngine, req.query));
}
/**
 * POST /:queueName/purge — executes the purge action.
 * @param req the request.
 * @param res the response.
 */
export async function purge(req: Request, res: Response): Promise<void> {
  const queueName = req.params.queueName ?? "";
  const result = await jmsQueueService.purge(req.operationsEngine, queueName, req.correlationId);
  auditLog(req.correlationId, {
    actor: req.security?.userId ?? "unknown",
    action: "jms-queue.purge",
    target: queueName,
  });
  res.json(result);
}
