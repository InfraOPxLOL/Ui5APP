import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { coeGlobalSettingsUpdateSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the CoE Admin module (spec §3 — Global Framework Configurations), mounted at
 * /api/v1/coe-admin. Reads and writes the four `.SYS_JMS_FRAMEWORK` string parameters through the
 * Operations Engine's Partner Directory engine.
 */
export const coeAdminRouter: Router = Router();

coeAdminRouter.get("/", catchAsync(controller.getGlobalSettings));

coeAdminRouter.put(
  "/",
  validateRequest({ body: coeGlobalSettingsUpdateSchema }),
  catchAsync(controller.saveGlobalSettings),
);
