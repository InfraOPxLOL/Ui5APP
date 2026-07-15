import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Analytics module, mounted at /api/v1/analytics. */
export const analyticsRouter: Router = Router();

analyticsRouter.get("/", validateRequest({ query: listQuerySchema }), catchAsync(controller.list));
