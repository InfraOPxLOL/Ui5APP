import type { Request, Response } from "express";
import { coeRegistryService } from "./service.js";
import type { RegistryUpdate } from "./dto.js";

/** HTTP handlers for the Global Partner Parameter Registry. Thin: parse request, call the service. */

/** GET /?pid=… — lists the parameters under a Partner ID. */
export async function getRegistry(req: Request, res: Response): Promise<void> {
  const pid = req.query.pid as string;
  res.json(await coeRegistryService.listByPid(pid));
}

/** PUT / — edits one parameter's value (body validated by the router). */
export async function updateParameter(req: Request, res: Response): Promise<void> {
  res.json(await coeRegistryService.updateParameter(req.body as RegistryUpdate));
}

/** DELETE /?pid=…&id=… — deletes one parameter. */
export async function deleteParameter(req: Request, res: Response): Promise<void> {
  await coeRegistryService.deleteParameter(req.query.pid as string, req.query.id as string);
  res.status(204).end();
}
