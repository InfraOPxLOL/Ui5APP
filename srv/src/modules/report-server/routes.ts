import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import {
  interchangeIdParamSchema,
  listQuerySchema,
  payloadParamSchema,
  summaryQuerySchema,
} from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Report Server (B2B interchanges), mounted at /api/v1/report-server. */
export const reportServerRouter: Router = Router();

// /summary is registered before /:interchangeId so the param route never swallows it.
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
