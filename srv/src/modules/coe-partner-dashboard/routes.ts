import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { partnerDetailQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Global Partner Master-Detail Dashboard, mounted at /api/v1/coe-partner-dashboard.
 * Read-only — derives the master partner list and reverse-engineers per-partner detail through the
 * Operations Engine's Partner Directory engine.
 */
export const coePartnerDashboardRouter: Router = Router();

coePartnerDashboardRouter.get("/", catchAsync(controller.listPartners));

coePartnerDashboardRouter.get(
  "/detail",
  validateRequest({ query: partnerDetailQuerySchema }),
  catchAsync(controller.getPartnerDetail),
);
