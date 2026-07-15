import type { Request, Response } from "express";
import { dashboardService } from "./service.js";

/**
 * HTTP handlers for the Dashboard module. Thin: parse request, call the service, shape response.
 */

/**
 * GET /summary — returns the aggregated KPI summary.
 * @param req the request.
 * @param res the response.
 */
export async function getSummary(req: Request, res: Response): Promise<void> {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  res.json(await dashboardService.getSummary(tenantId));
}
