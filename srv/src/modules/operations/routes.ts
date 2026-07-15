import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { overviewQuerySchema, searchQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Operations module, mounted at /api/v1/operations. Backed entirely by the Operations
 * Engine (Phase 6) — the workspace's single data source.
 */
export const operationsRouter: Router = Router();

operationsRouter.get(
  "/overview",
  validateRequest({ query: overviewQuerySchema }),
  catchAsync(controller.getOverview),
);

operationsRouter.get(
  "/search",
  validateRequest({ query: searchQuerySchema }),
  catchAsync(controller.search),
);
