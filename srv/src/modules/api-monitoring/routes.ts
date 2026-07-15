import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the API Monitoring module, mounted at /api/v1/api-monitoring. */
export const apiMonitoringRouter: Router = Router();

apiMonitoringRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);
