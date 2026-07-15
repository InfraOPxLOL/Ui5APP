import { Router } from "express";
import { catchAsync } from "../../core/middleware/errorHandler.middleware.js";
import { validateRequest } from "../../core/middleware/validateRequest.middleware.js";
import { attachmentParamSchema, messageIdParamSchema } from "./validators.js";
import * as controller from "./controller.js";

/**
 * Router for Payload Studio (Phase 10), mounted at /api/v1/payload-studio. Backed entirely by the
 * Operations Engine via {@link module:./service.PayloadStudioService}.
 */
export const payloadStudioRouter: Router = Router();

payloadStudioRouter.get(
  "/:messageId/attachments/:attachmentId/download",
  validateRequest({ params: attachmentParamSchema }),
  catchAsync(controller.downloadAttachment),
);

payloadStudioRouter.get(
  "/:messageId",
  validateRequest({ params: messageIdParamSchema }),
  catchAsync(controller.getStudio),
);
