import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import {
  historyQuerySchema,
  recoverBodySchema,
  recoveryIdParamSchema,
  sourceQueueParamSchema,
} from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Recovery Center module, mounted at /api/v1/recovery-center. Backed entirely by the
 * Operations Engine (`engine.recovery`) — the workspace's single data source.
 *
 * Every destructive endpoint requires `MessageReplay.Execute` (the same real XSUAA scope
 * `PI_RETRY_OPERATOR` already grants — architecture: `RoleCollections.ts`), matching precedent from
 * the `message-replay` module. `POST /:sourceQueue/recover` additionally requires `JmsQueue.Purge`
 * (granted by `PI_RECOVERY_ADMIN`) when the request omits `messageIds` — "recover all" on a queue is
 * a strictly larger blast radius than recovering a bounded selection, so it needs the higher tier;
 * enforced in `controller.recover`, since it depends on the request body, not just the route.
 */
export const recoveryCenterRouter: Router = Router();

recoveryCenterRouter.get("/dashboard", catchAsync(controller.getDashboard));
recoveryCenterRouter.get("/candidates", catchAsync(controller.listCandidates));
recoveryCenterRouter.get("/queue-health", catchAsync(controller.getQueueHealth));
recoveryCenterRouter.get("/dlq-overview", catchAsync(controller.getDlqOverview));
recoveryCenterRouter.get("/statistics", catchAsync(controller.getStatistics));
recoveryCenterRouter.get(
  "/history",
  validateRequest({ query: historyQuerySchema }),
  catchAsync(controller.getHistory),
);

recoveryCenterRouter.get(
  "/:sourceQueue/validate",
  validateRequest({ params: sourceQueueParamSchema }),
  catchAsync(controller.validate),
);
recoveryCenterRouter.get(
  "/:sourceQueue/preview",
  validateRequest({ params: sourceQueueParamSchema }),
  catchAsync(controller.preview),
);
recoveryCenterRouter.post(
  "/:sourceQueue/recover",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: sourceQueueParamSchema, body: recoverBodySchema }),
  catchAsync(controller.recover),
);
recoveryCenterRouter.post(
  "/:recoveryId/cancel",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: recoveryIdParamSchema }),
  catchAsync(controller.cancel),
);
recoveryCenterRouter.post(
  "/:recoveryId/retry",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: recoveryIdParamSchema }),
  catchAsync(controller.retry),
);
