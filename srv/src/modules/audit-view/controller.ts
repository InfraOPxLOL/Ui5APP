import type { Request, Response } from "express";
import { auditViewService } from "./service.js";

/**
 * HTTP handlers for the Audit Trail module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Audit Trail rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await auditViewService.list(req.query));
}
