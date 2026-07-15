import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Alerts module, mounted at /api/v1/alert-notification. */
export const alertNotificationRouter: Router = Router();

alertNotificationRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);
