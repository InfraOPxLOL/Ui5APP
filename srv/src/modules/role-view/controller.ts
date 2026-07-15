import type { Request, Response } from "express";
import { roleViewService } from "./service.js";

/**
 * HTTP handlers for the Roles module. Thin: parse request, call the service, shape response.
 */

/**
 * GET / — lists Roles rows.
 * @param req the request.
 * @param res the response.
 */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await roleViewService.list(req.query));
}
