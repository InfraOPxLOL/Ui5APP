import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import {
  exportQuerySchema,
  jmsRetryBodySchema,
  listQuerySchema,
  messageIdParamSchema,
} from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Message Investigation Workspace (Phase 9), mounted at /api/v1/message-monitoring.
 * Backed entirely by the Operations Engine via {@link module:./service.MessageMonitoringService}.
 */
export const messageMonitoringRouter: Router = Router();

// Order matters: /export must be registered before /:messageId so it is not swallowed by the param route.
messageMonitoringRouter.get(
  "/export",
  validateRequest({ query: exportQuerySchema }),
  catchAsync(controller.exportRows),
);

messageMonitoringRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);

messageMonitoringRouter.get(
  "/:messageId",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getById),
);

messageMonitoringRouter.get(
  "/:messageId/related",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getRelated),
);

messageMonitoringRouter.get(
  "/:messageId/context",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getContext),
);

// JMS retry (§ JMS Retry). The two GETs are read-only checks; only the POST mutates the tenant, and
// requires the same real scope (`MessageReplay.Execute`, granted by `PI_RETRY_OPERATOR`) every other
// retry-capable route in this app already requires (Recovery Center, Message Replay).
messageMonitoringRouter.get(
  "/:messageId/jms-eligibility",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getJmsEligibility),
);

messageMonitoringRouter.get(
  "/:messageId/retry-check",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getRetryCheck),
);

messageMonitoringRouter.post(
  "/:messageId/retry",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: messageIdParamSchema, body: jmsRetryBodySchema }),
  catchAsync(controller.retry),
);
