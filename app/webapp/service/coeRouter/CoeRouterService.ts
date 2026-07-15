import BaseService from "../../core/base/BaseService";
import type {
  AgreementLookup,
  AgreementLookupQuery,
  CombinedAgreementCheck,
  CombinedAgreementQuery,
  CombinedDeployRequest,
  PresentIn,
  RouteAgreementCheck,
  RouteAgreementQuery,
  RouteDeployRequest,
  RouteDeployResult,
  RouterAgreementQuery,
  RouterDeployRequest,
} from "./CoeRouterTypes";

/**
 * Data service for the CoE Route Wizard workspace (spec §4/§5). Consumes **only**
 * `/api/v1/coe-router`, which the backend composes from the Operations Engine's Partner Directory
 * engine — the workspace never talks to the SDK, never knows an Integration Suite endpoint, and only
 * ever handles CoE DTOs.
 */
export default class CoeRouterService extends BaseService {
  public constructor() {
    super("/api/v1/coe-router");
  }

  /**
   * Resolves the agreement track (normal vs ruleset) for a parsed IDoc + intended target.
   * @param query the parsed IDoc identifiers plus the intended target partner.
   * @param signal optional abort signal.
   * @returns the agreement check result.
   */
  public async checkAgreement(
    query: RouteAgreementQuery,
    signal?: AbortSignal,
  ): Promise<RouteAgreementCheck> {
    return this.client.post<RouteAgreementCheck, RouteAgreementQuery>(this.path("check"), query, {
      signal,
    });
  }

  /**
   * Deploys the route by creating its Partner Directory parameters.
   * @param request the full wizard payload.
   * @returns the per-parameter deploy result.
   */
  public async deployRoute(request: RouteDeployRequest): Promise<RouteDeployResult> {
    return this.client.post<RouteDeployResult, RouteDeployRequest>(this.path("deploy"), request);
  }

  /**
   * Resolves the Common Router agreement track (normal vs ruleset) for a parsed IDoc + intended
   * Common Router package.
   * @param query the parsed IDoc identifiers plus the intended router package PID.
   * @param signal optional abort signal.
   * @returns the agreement check result.
   */
  public async checkRouterAgreement(
    query: RouterAgreementQuery,
    signal?: AbortSignal,
  ): Promise<RouteAgreementCheck> {
    return this.client.post<RouteAgreementCheck, RouterAgreementQuery>(
      this.path("router/check"),
      query,
      { signal },
    );
  }

  /**
   * Deploys a Common Router route by creating its Partner Directory parameters.
   * @param request the Common Router deploy payload.
   * @returns the per-parameter deploy result.
   */
  public async deployCommonRouter(request: RouterDeployRequest): Promise<RouteDeployResult> {
    return this.client.post<RouteDeployResult, RouterDeployRequest>(
      this.path("router/deploy"),
      request,
    );
  }

  /**
   * Resolves both the JMS and Common Router agreement tracks for the combined flow.
   * @param query the parsed IDoc identifiers plus both intended targets.
   * @param signal optional abort signal.
   * @returns both agreement check results.
   */
  public async checkCombinedAgreement(
    query: CombinedAgreementQuery,
    signal?: AbortSignal,
  ): Promise<CombinedAgreementCheck> {
    return this.client.post<CombinedAgreementCheck, CombinedAgreementQuery>(
      this.path("combined/check"),
      query,
      { signal },
    );
  }

  /**
   * Deploys the combined "Create JMS + Common Router Connection" route.
   * @param request the combined wizard payload.
   * @returns the per-parameter deploy result.
   */
  public async deployJmsAndRouter(request: CombinedDeployRequest): Promise<RouteDeployResult> {
    return this.client.post<RouteDeployResult, CombinedDeployRequest>(
      this.path("combined/deploy"),
      request,
    );
  }

  /**
   * Read-only sender/receiver pair lookup for the Parameter Registry's JMS/Router Agreements boxes.
   * @param query which registry to read plus the sender/receiver (and optional message type).
   * @param signal optional abort signal.
   * @returns the lookup result.
   */
  public async lookupAgreement(
    query: AgreementLookupQuery,
    signal?: AbortSignal,
  ): Promise<AgreementLookup> {
    return this.client.get<AgreementLookup>(this.path("agreement/lookup"), {
      query: { type: query.type, sndprn: query.sndprn, rcvprn: query.rcvprn, mestyp: query.mestyp },
      signal,
    });
  }

  /**
   * Reverse lookup for the Parameter Registry's General Search "Present in" mode: every JMS/Router
   * agreement entry that routes to a given target PID.
   * @param targetPid the Partner ID to search for.
   * @param signal optional abort signal.
   * @returns every matching entry across both registries.
   */
  public async presentIn(targetPid: string, signal?: AbortSignal): Promise<PresentIn> {
    return this.client.get<PresentIn>(this.path("present-in"), { query: { targetPid }, signal });
  }
}
