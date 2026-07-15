import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { catchAsync } from "../core/middleware/errorHandler.middleware.js";
import { logger } from "../core/logging/logger.js";

import { dashboardRouter } from "../modules/dashboard/routes.js";
import { messageMonitoringRouter } from "../modules/message-monitoring/routes.js";
import { jmsQueueRouter } from "../modules/jms-queue/routes.js";
import { messageReplayRouter } from "../modules/message-replay/routes.js";
import { alertNotificationRouter } from "../modules/alert-notification/routes.js";
import { auditViewRouter } from "../modules/audit-view/routes.js";
import { roleViewRouter } from "../modules/role-view/routes.js";
import { administrationRouter } from "../modules/administration/routes.js";
import { apiMonitoringRouter } from "../modules/api-monitoring/routes.js";
import { integrationAdvisorRouter } from "../modules/integration-advisor/routes.js";
import { analyticsRouter } from "../modules/analytics/routes.js";
import { operationsRouter } from "../modules/operations/routes.js";
import { payloadStudioRouter } from "../modules/payload-studio/routes.js";
import { recoveryCenterRouter } from "../modules/recovery-center/routes.js";
import { runtimeCenterRouter } from "../modules/runtime-center/routes.js";
import { certificateSecurityCenterRouter } from "../modules/certificate-security-center/routes.js";
import { coeAdminRouter } from "../modules/coe-admin/routes.js";
import { coeRouterRouter } from "../modules/coe-router/routes.js";
import { coeRegistryRouter } from "../modules/coe-registry/routes.js";
import { coeDlqRouter } from "../modules/coe-dlq/routes.js";
import { coeRuleBuilderRouter } from "../modules/coe-rule-builder/routes.js";
import { coePartnerDashboardRouter } from "../modules/coe-partner-dashboard/routes.js";

/**
 * Assembles the versioned API router (`/api/v1`).
 *
 * This is the backend module-registration point: mounting a new module is one line here, mirroring
 * the frontend `ModuleRegistry` (architecture §12). It also exposes the small set of cross-cutting
 * system endpoints the frontend framework layer depends on (session, CSRF token, client logs).
 */
export const apiRouter: Router = Router();

// --- System endpoints -------------------------------------------------------

/** GET /csrf-token — issues a CSRF token (the approuter enforces CSRF in deployment). */
apiRouter.get("/csrf-token", (_req: Request, res: Response) => {
  res.setHeader("X-CSRF-Token", randomUUID());
  res.status(204).end();
});

/** GET /session/me — returns the authenticated user's identity and effective scopes. */
apiRouter.get("/session/me", (req: Request, res: Response) => {
  const security = req.security;
  res.json({
    id: security?.userId ?? "anonymous",
    name: security?.userName ?? "Anonymous",
    email: security?.email ?? "",
    scopes: security?.scopes ?? [],
  });
});

/** POST /client-logs — ingests batched client-side log entries into the backend log stream. */
apiRouter.post(
  "/client-logs",
  catchAsync(async (req: Request, res: Response) => {
    const entries = Array.isArray((req.body as { entries?: unknown[] })?.entries)
      ? (req.body as { entries: Record<string, unknown>[] }).entries
      : [];
    for (const entry of entries) {
      logger.warn({ client: true, correlationId: req.correlationId, ...entry }, "client.log");
    }
    res.status(204).end();
  }),
);

// --- Module routers ---------------------------------------------------------

apiRouter.use("/operations", operationsRouter);
apiRouter.use("/payload-studio", payloadStudioRouter);
apiRouter.use("/recovery-center", recoveryCenterRouter);
apiRouter.use("/runtime-center", runtimeCenterRouter);
apiRouter.use("/certificate-security-center", certificateSecurityCenterRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/message-monitoring", messageMonitoringRouter);
apiRouter.use("/jms-queue", jmsQueueRouter);
apiRouter.use("/message-replay", messageReplayRouter);
apiRouter.use("/alert-notification", alertNotificationRouter);
apiRouter.use("/audit-view", auditViewRouter);
apiRouter.use("/role-view", roleViewRouter);
apiRouter.use("/administration", administrationRouter);
apiRouter.use("/api-monitoring", apiMonitoringRouter);
apiRouter.use("/integration-advisor", integrationAdvisorRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/coe-admin", coeAdminRouter);
apiRouter.use("/coe-router", coeRouterRouter);
apiRouter.use("/coe-registry", coeRegistryRouter);
apiRouter.use("/coe-dlq", coeDlqRouter);
apiRouter.use("/coe-rule-builder", coeRuleBuilderRouter);
apiRouter.use("/coe-partner-dashboard", coePartnerDashboardRouter);
