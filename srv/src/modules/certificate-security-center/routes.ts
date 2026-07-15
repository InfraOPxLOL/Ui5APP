import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import { aliasParamSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the Certificate & Security Center module, mounted at
 * /api/v1/certificate-security-center. Backed entirely by the Operations Engine
 * (`engine.certificateSecurity`) — the workspace's single data source.
 *
 * `POST /certificates/:alias/flag-for-renewal` requires the `Operator` scope (granted by
 * `PI_CERTIFICATE_ADMIN` — architecture: `RoleCollections.ts`), mirroring `CertificateAdmin`'s
 * existing scope choice from Phase 6/11/12 precedent.
 */
export const certificateSecurityCenterRouter: Router = Router();

certificateSecurityCenterRouter.get("/dashboard", catchAsync(controller.getDashboard));
certificateSecurityCenterRouter.get("/certificates", catchAsync(controller.listCertificates));
certificateSecurityCenterRouter.get(
  "/security-materials",
  catchAsync(controller.listSecurityMaterials),
);

certificateSecurityCenterRouter.get(
  "/certificates/:alias",
  validateRequest({ params: aliasParamSchema }),
  catchAsync(controller.getCertificate),
);
certificateSecurityCenterRouter.get(
  "/certificates/:alias/timeline",
  validateRequest({ params: aliasParamSchema }),
  catchAsync(controller.getTimeline),
);
certificateSecurityCenterRouter.post(
  "/certificates/:alias/flag-for-renewal",
  requireScope("Operator"),
  validateRequest({ params: aliasParamSchema }),
  catchAsync(controller.flagForRenewal),
);
