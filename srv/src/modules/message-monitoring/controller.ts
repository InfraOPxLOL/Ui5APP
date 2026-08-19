import type { Request, Response } from "express";
import { messageMonitoringService, type MessageListQuery } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";

/**
 * HTTP handlers for the Message Investigation Workspace (Phase 9). Thin: parse the request, call the
 * service, shape the response.
 */

function toListQuery(query: Request["query"]): MessageListQuery {
  const q = query as Record<string, string | undefined>;
  return {
    status: q.status,
    severity: q.severity as MessageListQuery["severity"],
    sender: q.sender,
    receiver: q.receiver,
    messageType: q.messageType,
    customStatus: q.customStatus,
    applicationId: q.applicationId,
    integrationFlow: q.integrationFlow,
    correlationId: q.correlationId,
    queue: q.queue,
    search: q.search,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    durationMinMs: q.durationMinMs === undefined ? undefined : Number(q.durationMinMs),
    durationMaxMs: q.durationMaxMs === undefined ? undefined : Number(q.durationMaxMs),
    smartFilter: q.smartFilter as MessageListQuery["smartFilter"],
    framework: q.framework as MessageListQuery["framework"],
    recoveryState: q.recoveryState as MessageListQuery["recoveryState"],
    page: q.page === undefined ? undefined : Number(q.page),
    pageSize: q.pageSize === undefined ? undefined : Number(q.pageSize),
    sortBy: q.sortBy,
    sortDirection: q.sortDirection as MessageListQuery["sortDirection"],
  };
}

/** GET / — lists investigation rows. */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await messageMonitoringService.list(toListQuery(req.query)));
}

/** GET /:messageId — full investigation detail. */
export async function getById(req: Request, res: Response): Promise<void> {
  const detail = await messageMonitoringService.getById(req.params.messageId as string);
  if (detail === undefined) {
    throw HttpError.notFound(`No message found with id "${String(req.params.messageId)}".`);
  }
  res.json(detail);
}

/** GET /:messageId/related — related-message groups. */
export async function getRelated(req: Request, res: Response): Promise<void> {
  res.json(await messageMonitoringService.getRelated(req.params.messageId as string));
}

/** GET /:messageId/context — investigation panel context. */
export async function getContext(req: Request, res: Response): Promise<void> {
  const context = await messageMonitoringService.getContext(req.params.messageId as string);
  if (context === undefined) {
    throw HttpError.notFound(`No message found with id "${String(req.params.messageId)}".`);
  }
  res.json(context);
}

/** GET /export — bulk export of the current filtered working set. */
export async function exportRows(req: Request, res: Response): Promise<void> {
  const query = toListQuery(req.query);
  const format = (req.query as Record<string, string>).format as "csv" | "json" | "xml" | "excel";
  const model = await messageMonitoringService.exportRows(query, format);
  res.setHeader("Content-Type", model.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${model.fileName}"`);
  res.send(model.content);
}

/** GET /:messageId/jms-eligibility — cheap JMS-retryable classification. */
export async function getJmsEligibility(req: Request, res: Response): Promise<void> {
  res.json(await messageMonitoringService.checkJmsEligibility(req.params.messageId as string));
}

/** GET /:messageId/retry-check — full JMS retry resolution (queue + retry count, or manual-selection). */
export async function getRetryCheck(req: Request, res: Response): Promise<void> {
  res.json(await messageMonitoringService.getRetryCheck(req.params.messageId as string));
}

/** POST /:messageId/retry — executes a real JMS retry. */
export async function retry(req: Request, res: Response): Promise<void> {
  const body = req.body as { queueName: string; reason?: string };
  res.json(
    await messageMonitoringService.retry(req.params.messageId as string, body.queueName, body.reason),
  );
}

// --- Framework awareness & recovery (Phase 13) ---------------------------------

/** GET /:messageId/framework — full framework detection, with the evidence behind it. */
export async function getFramework(req: Request, res: Response): Promise<void> {
  res.json(await messageMonitoringService.getFramework(req.params.messageId as string));
}

/** GET /:messageId/recovery-plan — resolves one message's recovery plan (read-only). */
export async function getRecoveryPlan(req: Request, res: Response): Promise<void> {
  const queueName = (req.query as Record<string, string | undefined>).queueName;
  res.json(
    await messageMonitoringService.getRecoveryPlan(req.params.messageId as string, queueName),
  );
}

/** POST /recovery-plan — builds the pre-execution plan for a selection of messages (§9). */
export async function buildRecoveryPlan(req: Request, res: Response): Promise<void> {
  const body = req.body as { messageIds: string[] };
  res.json(await messageMonitoringService.buildRecoveryPlan(body.messageIds));
}

/** POST /:messageId/recover — executes framework-aware recovery (move → verify → retry). */
export async function recover(req: Request, res: Response): Promise<void> {
  const body = req.body as { reason?: string; queueName?: string };
  res.json(
    await messageMonitoringService.recover(
      req.params.messageId as string,
      body.reason,
      body.queueName,
    ),
  );
}
