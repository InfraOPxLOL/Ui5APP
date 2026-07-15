import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import { artifactIdParamSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Runtime Center module, mounted at /api/v1/runtime-center. Backed entirely by the
 * Operations Engine (`engine.runtimeCenter`) — the workspace's single data source.
 *
 * `POST /:artifactId/redeploy` requires the `Operator` scope (granted by `PI_RUNTIME_ADMIN` —
 * architecture: `RoleCollections.ts`), mirroring `CertificateAdmin`'s exact scope choice: no
 * dedicated "Runtime.Restart" scope exists in the frozen `xs-security.json`, so the roadmap
 * `PI_RUNTIME_ADMIN` collection is expressed against today's real `Operator` scope instead.
 */
export const runtimeCenterRouter: Router = Router();

runtimeCenterRouter.get("/catalog", catchAsync(controller.listCatalog));

runtimeCenterRouter.get(
  "/:artifactId/details",
  validateRequest({ params: artifactIdParamSchema }),
  catchAsync(controller.getDetails),
);
runtimeCenterRouter.get(
  "/:artifactId/health",
  validateRequest({ params: artifactIdParamSchema }),
  catchAsync(controller.getHealth),
);
runtimeCenterRouter.get(
  "/:artifactId/timeline",
  validateRequest({ params: artifactIdParamSchema }),
  catchAsync(controller.getDeploymentTimeline),
);
runtimeCenterRouter.post(
  "/:artifactId/redeploy",
  requireScope("Operator"),
  validateRequest({ params: artifactIdParamSchema }),
  catchAsync(controller.redeploy),
);
