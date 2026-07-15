import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { summaryQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Dashboard module, mounted at /api/v1/dashboard. */
export const dashboardRouter: Router = Router();

dashboardRouter.get(
  "/summary",
  validateRequest({ query: summaryQuerySchema }),
  catchAsync(controller.getSummary),
);
