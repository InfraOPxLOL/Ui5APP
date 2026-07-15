import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import {
  agreementLookupQuerySchema,
  combinedAgreementQuerySchema,
  combinedDeploySchema,
  presentInQuerySchema,
  routeAgreementQuerySchema,
  routeDeploySchema,
  routerAgreementQuerySchema,
  routerDeploySchema,
} from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the CoE Route Wizard module (spec §4/§5 — "Create JMS + Common Router Connection"),
 * mounted at /api/v1/coe-router. Resolves agreement collisions and deploys route parameters through
 * the Operations Engine's Partner Directory engine.
 */
export const coeRouterRouter: Router = Router();

coeRouterRouter.post(
  "/check",
  validateRequest({ body: routeAgreementQuerySchema }),
  catchAsync(controller.checkAgreement),
);

coeRouterRouter.post(
  "/deploy",
  validateRequest({ body: routeDeploySchema }),
  catchAsync(controller.deployRoute),
);

coeRouterRouter.post(
  "/router/check",
  validateRequest({ body: routerAgreementQuerySchema }),
  catchAsync(controller.checkRouterAgreement),
);

coeRouterRouter.post(
  "/router/deploy",
  validateRequest({ body: routerDeploySchema }),
  catchAsync(controller.deployCommonRouter),
);

coeRouterRouter.post(
  "/combined/check",
  validateRequest({ body: combinedAgreementQuerySchema }),
  catchAsync(controller.checkCombinedAgreement),
);

coeRouterRouter.post(
  "/combined/deploy",
  validateRequest({ body: combinedDeploySchema }),
  catchAsync(controller.deployJmsAndRouter),
);

coeRouterRouter.get(
  "/agreement/lookup",
  validateRequest({ query: agreementLookupQuerySchema }),
  catchAsync(controller.lookupAgreement),
);

coeRouterRouter.get(
  "/present-in",
  validateRequest({ query: presentInQuerySchema }),
  catchAsync(controller.presentIn),
);
