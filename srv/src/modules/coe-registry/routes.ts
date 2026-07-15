import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { registryDeleteSchema, registryQuerySchema, registryUpdateSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Global Partner Parameter Registry (spec §2, Tile 3), mounted at
 * /api/v1/coe-registry. Lists/edits/deletes Partner Directory parameters through the Operations
 * Engine's Partner Directory engine.
 */
export const coeRegistryRouter: Router = Router();

coeRegistryRouter.get(
  "/",
  validateRequest({ query: registryQuerySchema }),
  catchAsync(controller.getRegistry),
);

coeRegistryRouter.put(
  "/",
  validateRequest({ body: registryUpdateSchema }),
  catchAsync(controller.updateParameter),
);

coeRegistryRouter.delete(
  "/",
  validateRequest({ query: registryDeleteSchema }),
  catchAsync(controller.deleteParameter),
);
