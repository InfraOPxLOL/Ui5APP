import type { Request, Response } from "express";
import { certificateSecurityCenterService } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { auditLog } from "../../core/logging/logger.js";

/**
 * HTTP handlers for the Certificate & Security Center module. Thin: parse request, call the
 * service, shape response.
 */

function actorOf(req: Request): string {
  return req.security?.userName ?? req.security?.userId ?? "unknown";
}

/** GET /dashboard — the composed Certificate Dashboard. */
export async function getDashboard(_req: Request, res: Response): Promise<void> {
  res.json(await certificateSecurityCenterService.getDashboard());
}

/** GET /certificates — every keystore entry, enriched for the Certificate Explorer. */
export async function listCertificates(_req: Request, res: Response): Promise<void> {
  res.json(await certificateSecurityCenterService.listCertificates());
}

/** GET /certificates/:alias — one certificate's detail. */
export async function getCertificate(req: Request, res: Response): Promise<void> {
  const alias = req.params.alias as string;
  const certificate = await certificateSecurityCenterService.getCertificate(alias);
  if (certificate === undefined) {
    throw HttpError.notFound(`No certificate found with alias "${alias}".`);
  }
  res.json(certificate);
}

/** GET /security-materials — availability of every Security Material category. */
export async function listSecurityMaterials(_req: Request, res: Response): Promise<void> {
  res.json(await certificateSecurityCenterService.listSecurityMaterials());
}

/** GET /certificates/:alias/timeline — the certificate's Timeline. */
export async function getTimeline(req: Request, res: Response): Promise<void> {
  const alias = req.params.alias as string;
  const timeline = await certificateSecurityCenterService.getTimeline(alias);
  if (timeline === undefined) {
    throw HttpError.notFound(`No certificate found with alias "${alias}".`);
  }
  res.json(timeline);
}

/** POST /certificates/:alias/flag-for-renewal — flags a certificate for renewal. */
export async function flagForRenewal(req: Request, res: Response): Promise<void> {
  const alias = req.params.alias as string;
  const actor = actorOf(req);
  const event = await certificateSecurityCenterService.flagForRenewal(alias, actor);
  if (event === undefined) {
    throw HttpError.notFound(`No certificate found with alias "${alias}".`);
  }
  auditLog(req.correlationId, {
    actor,
    action: "certificate-security-center.flagForRenewal",
    target: alias,
    after: { eventId: event.eventId },
  });
  res.json(event);
}
