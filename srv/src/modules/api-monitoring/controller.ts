import type { Request, Response } from "express";
import { apiMonitoringService } from "./service.js";

/**
 * HTTP handlers for the API Monitoring module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists API Monitoring rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await apiMonitoringService.list(req.query));
}
