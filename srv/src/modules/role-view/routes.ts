import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Roles module, mounted at /api/v1/role-view. */
export const roleViewRouter: Router = Router();

roleViewRouter.get("/", validateRequest({ query: listQuerySchema }), catchAsync(controller.list));
