import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import {
  bulkRetryBodySchema,
  detailQuerySchema,
  listQuerySchema,
  messageIdParamSchema,
  retryBodySchema,
} from "./validators.js";
import * as controller from "./controller.js";

/** Router for Failed Transactions (TPM dead-letter queues), mounted at /api/v1/failed-transactions. */
export const failedTransactionsRouter: Router = Router();

// POST /retry is registered before /:messageId routes so the fixed path is never shadowed.
failedTransactionsRouter.post(
  "/retry",
  requireScope("MessageReplay.Execute"),
  validateRequest({ body: bulkRetryBodySchema }),
  catchAsync(controller.retryMany),
);

failedTransactionsRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);

failedTransactionsRouter.get(
  "/:messageId",
  validateRequest({ params: messageIdParamSchema, query: detailQuerySchema }),
  catchAsync(controller.getDetail),
);

failedTransactionsRouter.post(
  "/:messageId/retry",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: messageIdParamSchema, body: retryBodySchema }),
  catchAsync(controller.retry),
);
