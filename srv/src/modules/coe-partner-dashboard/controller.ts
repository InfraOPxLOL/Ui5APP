import type { Request, Response } from "express";
import { coePartnerDashboardService } from "./service.js";

/** HTTP handlers for the Global Partner Master-Detail Dashboard. Thin: parse request, call the service. */

/** GET / — the master list of known partners. */
export async function listPartners(_req: Request, res: Response): Promise<void> {
  res.json(await coePartnerDashboardService.listPartners());
}

/** GET /detail?pid=… — the reverse-engineered detail view for one Partner ID (query validated by the router). */
export async function getPartnerDetail(req: Request, res: Response): Promise<void> {
  res.json(await coePartnerDashboardService.getPartnerDetail(req.query.pid as string));
}
