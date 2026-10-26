import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import {
  correlationIdParamSchema,
  interchangeIdParamSchema,
  journeyQuerySchema,
  listQuerySchema,
  payloadParamSchema,
  summaryQuerySchema,
  transactionListQuerySchema,
} from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Report Server, mounted at /api/v1/report-server: B2B interchanges at the root,
 * non-B2B transactions under /transactions.
 */
export const reportServerRouter: Router = Router();

// Fixed paths (/summary, /transactions, /journey) are registered before /:interchangeId so the
// param route never swallows them.
reportServerRouter.get(
  "/journey",
  validateRequest({ query: journeyQuerySchema }),
  catchAsync(controller.getJourney),
);

reportServerRouter.get(
  "/transactions",
  validateRequest({ query: transactionListQuerySchema }),
  catchAsync(controller.listTransactions),
);

reportServerRouter.get(
  "/transactions/:correlationId",
  validateRequest({ params: correlationIdParamSchema }),
  catchAsync(controller.getTransaction),
);

reportServerRouter.get(
  "/summary",
  validateRequest({ query: summaryQuerySchema }),
  catchAsync(controller.summary),
);

reportServerRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);

reportServerRouter.get(
  "/:interchangeId",
  validateRequest({ params: interchangeIdParamSchema }),
  catchAsync(controller.getById),
);

reportServerRouter.get(
  "/:interchangeId/payloads/:payloadId",
  validateRequest({ params: payloadParamSchema }),
  catchAsync(controller.getPayload),
);
