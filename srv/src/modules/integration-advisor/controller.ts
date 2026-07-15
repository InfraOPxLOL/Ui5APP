import type { Request, Response } from "express";
import { integrationAdvisorService } from "./service.js";

/**
 * HTTP handlers for the Integration Advisor module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Integration Advisor rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await integrationAdvisorService.list(req.query));
}
