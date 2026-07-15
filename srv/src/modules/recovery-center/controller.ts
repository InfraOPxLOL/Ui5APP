import type { Request, Response } from "express";
import { recoveryCenterService } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { auditLog } from "../../core/logging/logger.js";
import type { RecoverRequestBody } from "./dto.js";

/**
 * HTTP handlers for the Recovery Center module. Thin: parse request, call the service, shape
 * response. Every destructive endpoint (`recover`/`cancel`/`retry`) is additionally gated by
 * `requireScope` at the route layer (see `routes.ts`) — the scope checks here only distinguish the
 * *operator* vs *admin* tier for a single already-scope-gated endpoint (recovering a bounded
 * selection vs. an entire queue) and feed the `userPermission` validation check honestly.
 */

const OPERATOR_SCOPE = "MessageReplay.Execute";
const ADMIN_SCOPE = "JmsQueue.Purge";

function hasScope(req: Request, scope: string): boolean {
  return req.security?.scopes.includes(scope) ?? false;
}

function actorOf(req: Request): string {
  return req.security?.userName ?? req.security?.userId ?? "unknown";
}

/** GET /dashboard — the composed Recovery Dashboard. */
export async function getDashboard(_req: Request, res: Response): Promise<void> {
  res.json(await recoveryCenterService.getDashboard());
}

/** GET /candidates — recovery candidates (dead-letter/retry queues holding parked messages). */
export async function listCandidates(_req: Request, res: Response): Promise<void> {
  res.json(await recoveryCenterService.listCandidates());
}

/** GET /queue-health — composite health view of every configured processing queue. */
export async function getQueueHealth(_req: Request, res: Response): Promise<void> {
  res.json(await recoveryCenterService.getQueueHealth());
}

/** GET /dlq-overview — one overview entry per configured dead-letter queue. */
export async function getDlqOverview(_req: Request, res: Response): Promise<void> {
  res.json(await recoveryCenterService.getDlqOverview());
}

/** GET /statistics — aggregate recovery statistics. */
export async function getStatistics(_req: Request, res: Response): Promise<void> {
  res.json(await recoveryCenterService.getStatistics());
}

/** GET /:sourceQueue/validate — runs every recovery validation check. */
export async function validate(req: Request, res: Response): Promise<void> {
  const sourceQueue = req.params.sourceQueue as string;
  res.json(await recoveryCenterService.validate(sourceQueue, hasScope(req, OPERATOR_SCOPE)));
}

/** GET /:sourceQueue/preview — the full preview shown before a recovery is confirmed. */
export async function preview(req: Request, res: Response): Promise<void> {
  const sourceQueue = req.params.sourceQueue as string;
  res.json(await recoveryCenterService.preview(sourceQueue, hasScope(req, OPERATOR_SCOPE)));
}

/** POST /:sourceQueue/recover — executes (or dry-run simulates) a recovery. */
export async function recover(req: Request, res: Response): Promise<void> {
  const sourceQueue = req.params.sourceQueue as string;
  const body = (req.body ?? {}) as RecoverRequestBody;
  if (body.messageIds === undefined && !hasScope(req, ADMIN_SCOPE)) {
    throw HttpError.forbidden(
      "Recovering an entire queue requires the Recovery Center administrator permission (PI_RECOVERY_ADMIN).",
    );
  }
  const operator = actorOf(req);
  const result = await recoveryCenterService.recover(
    sourceQueue,
    body,
    operator,
    hasScope(req, OPERATOR_SCOPE),
  );
  auditLog(req.correlationId, {
    actor: operator,
    action: "recovery-center.recover",
    target: sourceQueue,
    after: { recoveryId: result.recoveryId, status: result.status, dryRun: result.dryRun },
  });
  res.json(result);
}

/** POST /:recoveryId/cancel — cancels a recorded-but-not-yet-finalized recovery. */
export async function cancel(req: Request, res: Response): Promise<void> {
  const recoveryId = req.params.recoveryId as string;
  const entry = recoveryCenterService.cancel(recoveryId);
  if (entry === undefined) {
    throw HttpError.notFound(`No cancellable recovery found with id "${recoveryId}".`);
  }
  auditLog(req.correlationId, {
    actor: actorOf(req),
    action: "recovery-center.cancel",
    target: recoveryId,
  });
  res.json(entry);
}

/** POST /:recoveryId/retry — retries a previously failed or cancelled recovery. */
export async function retry(req: Request, res: Response): Promise<void> {
  const recoveryId = req.params.recoveryId as string;
  const result = await recoveryCenterService.retry(recoveryId, hasScope(req, OPERATOR_SCOPE));
  if (result === undefined) {
    throw HttpError.notFound(`No retryable recovery found with id "${recoveryId}".`);
  }
  auditLog(req.correlationId, {
    actor: actorOf(req),
    action: "recovery-center.retry",
    target: recoveryId,
    after: { recoveryId: result.recoveryId, status: result.status },
  });
  res.json(result);
}

/** GET /history — lists Recovery History, most recent first. */
export async function getHistory(req: Request, res: Response): Promise<void> {
  const skip = typeof req.query.skip === "string" ? Number(req.query.skip) : undefined;
  const top = typeof req.query.top === "string" ? Number(req.query.top) : undefined;
  res.json(recoveryCenterService.getHistory(skip, top));
}
