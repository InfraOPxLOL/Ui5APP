import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import { replayParamsSchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the Message Replay module, mounted at /api/v1/message-replay. */
export const messageReplayRouter: Router = Router();

messageReplayRouter.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  catchAsync(controller.list),
);

messageReplayRouter.post(
  "/:messageId/replay",
  requireScope("MessageReplay.Execute"),
  validateRequest({ params: replayParamsSchema }),
  catchAsync(controller.replay),
);
