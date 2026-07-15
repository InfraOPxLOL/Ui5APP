import type { Request, Response } from "express";
import { coeRouterService } from "./service.js";
import type {
  AgreementLookupQuery,
  CombinedAgreementQuery,
  CombinedDeployRequest,
  RouteAgreementQuery,
  RouteDeployRequest,
  RouterAgreementQuery,
  RouterDeployRequest,
} from "./dto.js";

/** HTTP handlers for the CoE Route Wizard module. Thin: parse request, call the service, shape response. */

/** POST /check — resolves the normal-vs-ruleset agreement track for a parsed IDoc (body validated by the router). */
export async function checkAgreement(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.checkAgreement(req.body as RouteAgreementQuery));
}

/** POST /deploy — creates the route's Partner Directory parameters (body validated by the router). */
export async function deployRoute(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.deployRoute(req.body as RouteDeployRequest));
}

/** POST /router/check — resolves the Common Router agreement track (body validated by the router). */
export async function checkRouterAgreement(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.checkRouterAgreement(req.body as RouterAgreementQuery));
}

/** POST /router/deploy — creates the Common Router parameters (body validated by the router). */
export async function deployCommonRouter(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.deployCommonRouter(req.body as RouterDeployRequest));
}

/** POST /combined/check — resolves both the JMS and Common Router tracks (body validated by the router). */
export async function checkCombinedAgreement(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.checkCombinedAgreement(req.body as CombinedAgreementQuery));
}

/** POST /combined/deploy — creates the combined JMS + Common Router parameters (body validated by the router). */
export async function deployJmsAndRouter(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.deployJmsAndRouter(req.body as CombinedDeployRequest));
}

/** GET /agreement/lookup — read-only sender/receiver pair lookup for the Parameter Registry (query validated by the router). */
export async function lookupAgreement(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.lookupAgreement(req.query as unknown as AgreementLookupQuery));
}

/** GET /present-in — reverse lookup of every agreement entry routing to a target PID (query validated by the router). */
export async function presentIn(req: Request, res: Response): Promise<void> {
  res.json(await coeRouterService.presentIn(req.query.targetPid as string));
}
