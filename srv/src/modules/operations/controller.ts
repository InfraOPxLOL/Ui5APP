import type { Request, Response } from "express";
import { operationsService } from "./service.js";

/**
 * HTTP handlers for the Operations module. Thin: parse request, call the service, shape response.
 */

/**
 * GET /overview — returns the aggregated Operations Overview.
 * @param req the request.
 * @param res the response.
 */
export async function getOverview(req: Request, res: Response): Promise<void> {
  const windowHours =
    typeof req.query.windowHours === "string" ? Number(req.query.windowHours) : undefined;
  res.json(await operationsService.getOverview(windowHours));
}

/**
 * GET /search — runs the aggregated workspace search.
 * @param req the request.
 * @param res the response.
 */
export async function search(req: Request, res: Response): Promise<void> {
  const term = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await operationsService.search(term));
}
