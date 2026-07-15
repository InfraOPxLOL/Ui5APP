import type { Request, Response } from "express";
import { runtimeCenterService } from "./service.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { auditLog } from "../../core/logging/logger.js";

/** HTTP handlers for the Runtime Center module. Thin: parse request, call the service, shape response. */

function actorOf(req: Request): string {
  return req.security?.userName ?? req.security?.userId ?? "unknown";
}

/** GET /catalog — every deployed integration flow, enriched with recent message stats. */
export async function listCatalog(_req: Request, res: Response): Promise<void> {
  res.json(await runtimeCenterService.listCatalog());
}

/** GET /:artifactId/details — the full Integration Details view. */
export async function getDetails(req: Request, res: Response): Promise<void> {
  const artifactId = req.params.artifactId as string;
  const details = await runtimeCenterService.getDetails(artifactId);
  if (details === undefined) {
    throw HttpError.notFound(`No runtime artifact found with id "${artifactId}".`);
  }
  res.json(details);
}

/** GET /:artifactId/health — Runtime Health (score, success rate, average runtime, failure trend, alerts). */
export async function getHealth(req: Request, res: Response): Promise<void> {
  const artifactId = req.params.artifactId as string;
  const health = await runtimeCenterService.getHealth(artifactId);
  if (health === undefined) {
    throw HttpError.notFound(`No runtime artifact found with id "${artifactId}".`);
  }
  res.json(health);
}

/** GET /:artifactId/timeline — the Deployment Timeline. */
export async function getDeploymentTimeline(req: Request, res: Response): Promise<void> {
  const artifactId = req.params.artifactId as string;
  const timeline = await runtimeCenterService.getDeploymentTimeline(artifactId);
  if (timeline === undefined) {
    throw HttpError.notFound(`No runtime artifact found with id "${artifactId}".`);
  }
  res.json(timeline);
}

/** POST /:artifactId/redeploy — redeploys an artifact and records a Deployment Timeline event. */
export async function redeploy(req: Request, res: Response): Promise<void> {
  const artifactId = req.params.artifactId as string;
  const actor = actorOf(req);
  const event = await runtimeCenterService.redeploy(artifactId, actor);
  if (event === undefined) {
    throw HttpError.notFound(`No runtime artifact found with id "${artifactId}".`);
  }
  auditLog(req.correlationId, {
    actor,
    action: "runtime-center.redeploy",
    target: artifactId,
    after: { eventId: event.eventId, version: event.version },
  });
  res.json(event);
}
