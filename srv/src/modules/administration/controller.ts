import type { Request, Response } from "express";
import { administrationService } from "./service.js";

/**
 * HTTP handlers for the Administration module.
 */

/**
 * GET / — lists configured destinations.
 * @param _req the request.
 * @param res the response.
 */
export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await administrationService.list());
}

/**
 * GET /config — returns the client-facing configuration projection.
 * @param _req the request.
 * @param res the response.
 */
export async function getConfig(_req: Request, res: Response): Promise<void> {
  res.json(administrationService.getClientConfig());
}
