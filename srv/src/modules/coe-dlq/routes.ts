import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { z } from "zod";
import * as controller from "./controller.js";

/** Path-parameter schema for the per-message endpoints. */
const messageIdParamSchema = z.object({ messageId: z.string().min(1) });

/**
 * Router for the DLQ & Intelligent Recovery Dashboard (spec §6, Tile 4), mounted at
 * /api/v1/coe-dlq. Reads failed messages and resolves recovery queues through the Operations Engine.
 */
export const coeDlqRouter: Router = Router();

coeDlqRouter.get("/", catchAsync(controller.listFailedMessages));

coeDlqRouter.get(
  "/:messageId/recovery",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getRecovery),
);

coeDlqRouter.post(
  "/:messageId/replay",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.replay),
);
