import type { Request, Response } from "express";
import { alertNotificationService } from "./service.js";

/**
 * HTTP handlers for the Alerts module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Alerts rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await alertNotificationService.list(req.query));
}
