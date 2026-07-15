import type { Request, Response } from "express";
import { analyticsService } from "./service.js";

/**
 * HTTP handlers for the Analytics module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Analytics rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await analyticsService.list(req.query));
}
