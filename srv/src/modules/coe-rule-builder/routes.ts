import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { ruleListQuerySchema, ruleQuerySchema, ruleSaveSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for the CoE Visual Rule Builder, mounted at /api/v1/coe-rule-builder. Reads/writes rule
 * content (Agreement Ruleset / X-Cast Endpoint Resolver) stored as Partner Directory binary
 * parameters through the Operations Engine's Partner Directory engine.
 */
export const coeRuleBuilderRouter: Router = Router();

coeRuleBuilderRouter.get(
  "/list",
  validateRequest({ query: ruleListQuerySchema }),
  catchAsync(controller.listRules),
);

coeRuleBuilderRouter.get(
  "/",
  validateRequest({ query: ruleQuerySchema }),
  catchAsync(controller.getRule),
);

coeRuleBuilderRouter.put(
  "/",
  validateRequest({ body: ruleSaveSchema }),
  catchAsync(controller.saveRule),
);

coeRuleBuilderRouter.delete(
  "/",
  validateRequest({ query: ruleQuerySchema }),
  catchAsync(controller.deleteRule),
);
