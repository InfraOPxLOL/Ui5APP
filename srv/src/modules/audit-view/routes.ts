import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Audit Trail module, mounted at /api/v1/audit-view. */
export const auditViewRouter: Router = Router();

auditViewRouter.get("/", validateRequest({ query: listQuerySchema }), catchAsync(controller.list));
