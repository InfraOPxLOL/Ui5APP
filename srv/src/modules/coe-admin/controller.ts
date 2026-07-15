import type { Request, Response } from "express";
import { coeAdminService } from "./service.js";
import type { CoeGlobalSettingsUpdate } from "./dto.js";

/** HTTP handlers for the CoE Admin module. Thin: parse request, call the service, shape response. */

/** GET / — the current global framework settings. */
export async function getGlobalSettings(_req: Request, res: Response): Promise<void> {
  res.json(await coeAdminService.getGlobalSettings());
}

/** PUT / — persists the global framework settings (body already validated by the router). */
export async function saveGlobalSettings(req: Request, res: Response): Promise<void> {
  const update = req.body as CoeGlobalSettingsUpdate;
  res.json(await coeAdminService.saveGlobalSettings(update));
}
