import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { listQuerySchema } from "./validators.js";
import { requireScope } from "../../core/middleware/auth.middleware.js";
import { purgeParamsSchema } from "./validators.js";
import * as controller from "./controller.js";

/** Router for the JMS Queues module, mounted at /api/v1/jms-queue. */
export const jmsQueueRouter: Router = Router();

jmsQueueRouter.get("/", validateRequest({ query: listQuerySchema }), catchAsync(controller.list));

jmsQueueRouter.post(
  "/:queueName/purge",
  requireScope("JmsQueue.Purge"),
  validateRequest({ params: purgeParamsSchema }),
  catchAsync(controller.purge),
);
