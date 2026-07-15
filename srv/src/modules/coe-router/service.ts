import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import {
  JMS_AGREEMENTS_PID,
  ROUTER_AGREEMENTS_PID,
  type AgreementLookupDto,
  type AgreementLookupQuery,
  type CombinedAgreementCheckDto,
  type CombinedAgreementQuery,
  type CombinedDeployRequest,
  type DeployedParameter,
  type PresentInDto,
  type PresentInEntryDto,
  type RouteAgreementCheckDto,
  type RouteAgreementQuery,
  type RouteDeployRequest,
  type RouteDeployResult,
  type RouteIdoc,
  type RouterAgreementQuery,
  type RouterDeployRequest,
  type RulesetCandidateDto,
  type RulesetFollowUp,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/** One string parameter to write during a deploy. */
interface ParameterWrite {
  readonly pid: string;
  readonly id: string;
  readonly value: string;
}

/** The outcome of a ruleset escalation: the parameters it touched plus the still-needed follow-up. */
interface RulesetHousekeepingResult {
  readonly writes: readonly DeployedParameter[];
  readonly warning: string;
  readonly followUp: RulesetFollowUp;
}

/**
 * Builds the 6-part route key `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}`, substituting
 * `*` for any part absent/unparsable in the EDI_DC40 control record (per the framework's convention).
 * This is the *display* form; see {@link toStorageKey} for the form written to a parameter Id.
 */
export function buildRouteKey(idoc: RouteIdoc): string {
  const part = (value: string): string => (value.trim() === "" ? "*" : value.trim());
  return `.${part(idoc.idoctyp)}.${part(idoc.mestyp)}.${part(idoc.sndpor)}.${part(idoc.sndprn)}.${part(idoc.rcvpor)}.${part(idoc.rcvprn)}`;
}

/**
 * The character a missing route-key part is stored as inside a Partner Directory parameter Id. CPI
 * restricts `StringParameter` Ids to `[a-zA-Z0-9-._~<>@]`, so the display `*` cannot be persisted —
 * `~` (in the allowed set) is substituted for it in the stored `QUEUE_JMS_`/`ROUTE_JMS_`/`RCV_JMS_`/
 * `ROUTE_` parameter Ids. The route key returned to the UI keeps `*`.
 */
const MISSING_PART_STORAGE_CHAR = "~";

/** Converts the display route key (with `*`) into the CPI-legal form used in a parameter Id. */
export function toStorageKey(routeKey: string): string {
  return routeKey.replace(/\*/g, MISSING_PART_STORAGE_CHAR);
}

/** Reverses {@link toStorageKey}: converts a stored parameter Id's route-key suffix back into the display form. */
export function fromStorageKey(storageKey: string): string {
  return storageKey.replaceAll(MISSING_PART_STORAGE_CHAR, "*");
}

/** The six identifiers a display route key decomposes into (see {@link buildRouteKey}). */
export interface RouteKeyParts {
  readonly idoctyp: string;
  readonly mestyp: string;
  readonly sndpor: string;
  readonly sndprn: string;
  readonly rcvpor: string;
  readonly rcvprn: string;
}

/**
 * Reverses {@link buildRouteKey}: splits a display route key back into its six identifiers, for
 * reverse-engineering an existing route from its stored parameter Ids (Parameter Registry's Global
 * Partner Master-Detail dashboard). Returns `undefined` for anything that isn't a well-formed 6-part
 * key (e.g. a parameter that happens to share a prefix but isn't actually route-keyed).
 */
export function parseRouteKey(routeKey: string): RouteKeyParts | undefined {
  // A well-formed key is ".{a}.{b}.{c}.{d}.{e}.{f}" — splitting on "." yields 7 pieces, the first empty.
  const parts = routeKey.split(".");
  if (parts.length !== 7 || parts[0] !== "") {
    return undefined;
  }
  const [, idoctyp, mestyp, sndpor, sndprn, rcvpor, rcvprn] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return { idoctyp, mestyp, sndpor, sndprn, rcvpor, rcvprn };
}

/** The standard agreement key `.{SNDPRN}.{RCVPRN}` (shared by both agreement registries). */
export function standardAgreementKey(sndprn: string, rcvprn: string): string {
  return `.${sndprn}.${rcvprn}`;
}

/** The message-type-specific agreement key `.{MESTYP}.{SNDPRN}.{RCVPRN}`, which wins over the standard one when both exist. */
export function specificAgreementKey(mestyp: string, sndprn: string, rcvprn: string): string {
  return `.${mestyp}.${sndprn}.${rcvprn}`;
}

/** The ruleset agreement key `RULESET_.{SNDPRN}.{RCVPRN}` a pair escalates into once it legitimately shares more than one target. */
export function rulesetKey(sndprn: string, rcvprn: string): string {
  return `RULESET_.${sndprn}.${rcvprn}`;
}

/**
 * Aggregation service for the CoE Route Wizard (spec §4/§5). Reads/writes Partner Directory string
 * parameters through `engine.partnerDirectory` per the confirmed framework model (see `dto.ts`). No
 * SDK/OData/CPI shape leaves this layer.
 */
export class CoeRouterService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Resolves whether a route creation is a normal mapping or a shared-partner collision (spec §4
   * Step 2), by reading the agreement parameters under `_Maintain_JMS_Agreements`.
   * @param query the parsed sender/receiver/message-type plus the intended target partner.
   * @returns the agreement check result.
   */
  public async checkAgreement(query: RouteAgreementQuery): Promise<RouteAgreementCheckDto> {
    return this.resolveAgreement(
      JMS_AGREEMENTS_PID,
      query.sndprn,
      query.rcvprn,
      query.mestyp,
      query.targetPid,
    );
  }

  /**
   * Resolves the Common Router agreement track (normal vs ruleset) by reading the agreement
   * parameters under `_Maintain_Router_Agreements` — the router analogue of {@link checkAgreement}.
   * @param query the parsed sender/receiver/message-type plus the intended Common Router package.
   * @returns the agreement check result (`existingTargetPid` here is the existing router PID).
   */
  public async checkRouterAgreement(query: RouterAgreementQuery): Promise<RouteAgreementCheckDto> {
    return this.resolveAgreement(
      ROUTER_AGREEMENTS_PID,
      query.sndprn,
      query.rcvprn,
      query.mestyp,
      query.routerPid,
    );
  }

  /**
   * Runs the JMS and Common Router agreement checks side by side for the combined flow (spec §4,
   * Tile 1 — "Create JMS + Common Router Connection"). Each track is resolved independently: a
   * collision on one side does not affect the other.
   * @param query the parsed IDoc identifiers plus both intended targets.
   * @returns both agreement check results.
   */
  public async checkCombinedAgreement(
    query: CombinedAgreementQuery,
  ): Promise<CombinedAgreementCheckDto> {
    const [jms, router] = await Promise.all([
      this.checkAgreement({
        sndprn: query.sndprn,
        rcvprn: query.rcvprn,
        mestyp: query.mestyp,
        targetPid: query.targetPid,
      }),
      this.checkRouterAgreement({
        sndprn: query.sndprn,
        rcvprn: query.rcvprn,
        mestyp: query.mestyp,
        routerPid: query.routerPid,
      }),
    ]);
    return { jms, router };
  }

  /**
   * Reads the agreement parameters under a registry PID and decides the track. Once a pair has been
   * escalated to a `RULESET_` entry (user-confirmed convention: multiple targets legitimately share
   * it) it **stays** a ruleset regardless of the intended value — only the registry, not this wizard,
   * can walk that back. Otherwise, a pre-existing plain agreement pointing at a *different* value than
   * the one intended ⇒ ruleset track; nothing found, or the same owner ⇒ normal. The specific
   * (message-type-scoped) agreement wins over the standard one when both exist.
   */
  private async resolveAgreement(
    storePid: string,
    sndprn: string,
    rcvprn: string,
    mestyp: string,
    intendedValue: string,
  ): Promise<RouteAgreementCheckDto> {
    const engine = this.engineFactory();
    const agreementKey = standardAgreementKey(sndprn, rcvprn);
    const specificKey = specificAgreementKey(mestyp, sndprn, rcvprn);
    const rsKey = rulesetKey(sndprn, rcvprn);

    const [specific, standard, ruleset] = await Promise.all([
      engine.partnerDirectory.getStringParameter(storePid, specificKey),
      engine.partnerDirectory.getStringParameter(storePid, agreementKey),
      engine.partnerDirectory.getStringParameter(storePid, rsKey),
    ]);

    if (ruleset !== undefined) {
      return {
        track: "ruleset",
        agreementStorePid: storePid,
        agreementKey,
        specificAgreementKey: specificKey,
        agreementExists: true,
        existingTargetPid: ruleset.value,
        rulesetKey: rsKey,
      };
    }

    const existingTargetPid = specific?.value ?? standard?.value;
    const isRuleset = existingTargetPid !== undefined && existingTargetPid !== intendedValue;

    return {
      track: isRuleset ? "ruleset" : "normal",
      agreementStorePid: storePid,
      agreementKey,
      specificAgreementKey: specificKey,
      agreementExists: existingTargetPid !== undefined,
      existingTargetPid,
      rulesetKey: isRuleset ? rsKey : undefined,
    };
  }

  /**
   * Read-only sender/receiver pair lookup for the Parameter Registry's JMS/Router Agreements boxes —
   * unlike {@link resolveAgreement}, there is no "intended value" to compare against: this simply
   * reports what is there. On a `ruleset` hit, every candidate's Binary Parameter rule-authored status
   * is checked too, so the UI can show which candidates still need a rule (mirrors the ruleset-
   * escalation follow-up surfaced by deploys).
   * @param query which registry to read plus the sender/receiver (and optional message type).
   * @returns the lookup result.
   */
  public async lookupAgreement(query: AgreementLookupQuery): Promise<AgreementLookupDto> {
    const storePid = query.type === "jms" ? JMS_AGREEMENTS_PID : ROUTER_AGREEMENTS_PID;
    const engine = this.engineFactory();
    const agreementKey = standardAgreementKey(query.sndprn, query.rcvprn);
    const specificKey =
      query.mestyp !== undefined && query.mestyp !== ""
        ? specificAgreementKey(query.mestyp, query.sndprn, query.rcvprn)
        : undefined;
    const rsKey = rulesetKey(query.sndprn, query.rcvprn);

    const [specific, standard, ruleset] = await Promise.all([
      specificKey !== undefined
        ? engine.partnerDirectory.getStringParameter(storePid, specificKey)
        : Promise.resolve(undefined),
      engine.partnerDirectory.getStringParameter(storePid, agreementKey),
      engine.partnerDirectory.getStringParameter(storePid, rsKey),
    ]);

    if (ruleset !== undefined) {
      const candidateNames = ruleset.value
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "");
      const candidates: RulesetCandidateDto[] = await Promise.all(
        candidateNames.map(async (targetPid) => ({
          targetPid,
          ruleAuthored: (await engine.partnerDirectory.getBinaryParameter(storePid, targetPid)) !== undefined,
        })),
      );
      return {
        storePid,
        agreementKey,
        specificAgreementKey: specificKey,
        found: true,
        kind: "ruleset",
        targetPid: undefined,
        candidates,
      };
    }

    const existingTargetPid = specific?.value ?? standard?.value;
    if (existingTargetPid !== undefined) {
      return {
        storePid,
        agreementKey,
        specificAgreementKey: specificKey,
        found: true,
        kind: "normal",
        targetPid: existingTargetPid,
        candidates: undefined,
      };
    }

    return {
      storePid,
      agreementKey,
      specificAgreementKey: specificKey,
      found: false,
      kind: "none",
      targetPid: undefined,
      candidates: undefined,
    };
  }

  /**
   * Reverse lookup for the Parameter Registry's General Search "Present in" mode: every JMS/Router
   * agreement entry (plain or `RULESET_`) whose value references the given target PID. Scoped to the
   * two fixed agreement registries — not a tenant-wide scan (see spec discussion: the Partner Directory
   * has no cross-PID query capability, and a full scan would be prohibitively expensive/slow).
   * @param targetPid the Partner ID to search for.
   * @returns every matching entry across both registries.
   */
  public async presentIn(targetPid: string): Promise<PresentInDto> {
    const engine = this.engineFactory();
    const [jms, router] = await Promise.all([
      engine.partnerDirectory.listStringParameters(JMS_AGREEMENTS_PID),
      engine.partnerDirectory.listStringParameters(ROUTER_AGREEMENTS_PID),
    ]);
    const scan = (
      parameters: readonly { readonly id: string; readonly value: string }[],
      storePid: string,
    ): PresentInEntryDto[] =>
      parameters
        .filter((parameter) =>
          parameter.value
            .split(",")
            .map((value) => value.trim())
            .includes(targetPid),
        )
        .map((parameter) => ({
          storePid,
          id: parameter.id,
          value: parameter.value,
          isRuleset: parameter.id.startsWith("RULESET_"),
        }));
    return {
      targetPid,
      entries: [...scan(jms, JMS_AGREEMENTS_PID), ...scan(router, ROUTER_AGREEMENTS_PID)],
    };
  }

  /**
   * Deploys a route by creating its Partner Directory parameters (spec §4/§5). Best-effort and
   * idempotent: each parameter is upserted in turn and its outcome recorded; a partial failure leaves
   * the successful writes in place (upserts are safe to re-run).
   *
   * On the **normal** track the agreement `.{SNDPRN}.{RCVPRN}` under `_Maintain_JMS_Agreements` is
   * (re)pointed at the target PID. On the **ruleset** track the plain agreement is escalated — see
   * {@link applyRulesetHousekeeping} — and the route parameters are still written under the target PID
   * being deployed, so the route becomes resolvable once a Binary Parameter rule disambiguates it.
   * @param request the full wizard payload.
   * @returns the per-parameter deploy result plus the built route key.
   */
  public async deployRoute(request: RouteDeployRequest): Promise<RouteDeployResult> {
    const routeKey = buildRouteKey(request.idoc);
    const ruleset =
      request.track === "ruleset"
        ? await this.applyRulesetHousekeeping(
            JMS_AGREEMENTS_PID,
            request.idoc.sndprn,
            request.idoc.rcvprn,
            request.targetPid,
          )
        : undefined;
    return this.runWrites(routeKey, CoeRouterService.buildWrites(request, routeKey), ruleset);
  }

  /**
   * Deploys a Common Router route (spec §4 — "Create only Common Router"): registers the route→target
   * mapping under the shared Common Router package and points the partner pair's agreement at it. Same
   * best-effort, idempotent, per-parameter semantics as {@link deployRoute}.
   * @param request the Common Router deploy payload.
   * @returns the per-parameter deploy result plus the built route key.
   */
  public async deployCommonRouter(request: RouterDeployRequest): Promise<RouteDeployResult> {
    const routeKey = buildRouteKey(request.idoc);
    const ruleset =
      request.track === "ruleset"
        ? await this.applyRulesetHousekeeping(
            ROUTER_AGREEMENTS_PID,
            request.idoc.sndprn,
            request.idoc.rcvprn,
            request.routerPid,
          )
        : undefined;
    return this.runWrites(routeKey, CoeRouterService.buildRouterWrites(request, routeKey), ruleset);
  }

  /**
   * Deploys the combined "Create JMS + Common Router Connection" route (spec §4, Tile 1): everything
   * {@link deployRoute} writes, plus the Common Router registration for the same route key — the JMS
   * `targetPid` doubles as the router's `finalTargetPid` (one partner, one route). Both write sets are
   * assembled and upserted together as a single best-effort batch; the JMS and router agreement tracks
   * are escalated to a ruleset independently of one another.
   * @param request the combined wizard payload.
   * @returns the per-parameter deploy result plus the built route key.
   */
  public async deployJmsAndRouter(request: CombinedDeployRequest): Promise<RouteDeployResult> {
    const routeKey = buildRouteKey(request.idoc);
    const jmsWrites = CoeRouterService.buildWrites(
      {
        idoc: request.idoc,
        targetPid: request.targetPid,
        targetQueue: request.targetQueue,
        endpointUri: request.endpointUri,
        track: request.jmsTrack,
        rulesetKey: request.jmsRulesetKey,
        customMapping: request.customMapping,
        alerting: request.alerting,
        optimization: request.optimization,
      },
      routeKey,
    );
    const routerWrites = CoeRouterService.buildRouterWrites(
      {
        idoc: request.idoc,
        routerPid: request.routerPid,
        finalTargetPid: request.targetPid,
        track: request.routerTrack,
        rulesetKey: request.routerRulesetKey,
      },
      routeKey,
    );
    const [jmsRuleset, routerRuleset] = await Promise.all([
      request.jmsTrack === "ruleset"
        ? this.applyRulesetHousekeeping(
            JMS_AGREEMENTS_PID,
            request.idoc.sndprn,
            request.idoc.rcvprn,
            request.targetPid,
          )
        : undefined,
      request.routerTrack === "ruleset"
        ? this.applyRulesetHousekeeping(
            ROUTER_AGREEMENTS_PID,
            request.idoc.sndprn,
            request.idoc.rcvprn,
            request.routerPid,
          )
        : undefined,
    ]);
    return this.runWrites(routeKey, [...jmsWrites, ...routerWrites], jmsRuleset, routerRuleset);
  }

  /**
   * Escalates a sender/receiver pair from a single-value agreement into a `RULESET_.{SNDPRN}.{RCVPRN}`
   * entry (user-confirmed convention): merges the new target into the comma-separated candidate list
   * — seeding it from the plain agreement's current value the first time, or from the existing
   * `RULESET_` entry on every escalation after that — then deletes the now-superseded plain key. The
   * actual disambiguation between candidates still needs a Binary Parameter rule named after the new
   * target under the same registry PID; since the Visual Rule Builder that authors those rules isn't
   * built yet, this returns a warning instead of fabricating one.
   */
  private async applyRulesetHousekeeping(
    storePid: string,
    sndprn: string,
    rcvprn: string,
    newTarget: string,
  ): Promise<RulesetHousekeepingResult> {
    const engine = this.engineFactory();
    const agreementKey = standardAgreementKey(sndprn, rcvprn);
    const rsKey = rulesetKey(sndprn, rcvprn);

    const [ruleset, plain] = await Promise.all([
      engine.partnerDirectory.getStringParameter(storePid, rsKey),
      engine.partnerDirectory.getStringParameter(storePid, agreementKey),
    ]);
    const candidates = new Set<string>();
    if (ruleset !== undefined) {
      ruleset.value
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "")
        .forEach((value) => candidates.add(value));
    }
    if (plain !== undefined) {
      candidates.add(plain.value);
    }
    candidates.add(newTarget);
    const mergedValue = [...candidates].join(",");

    const writes: DeployedParameter[] = [];
    try {
      await engine.partnerDirectory.saveStringParameter(storePid, rsKey, mergedValue);
      writes.push({ pid: storePid, id: rsKey, status: "ok", error: undefined });
    } catch (error) {
      writes.push({
        pid: storePid,
        id: rsKey,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (plain !== undefined) {
      try {
        await engine.partnerDirectory.deleteStringParameter(storePid, agreementKey);
        writes.push({ pid: storePid, id: agreementKey, status: "ok", error: undefined });
      } catch (error) {
        writes.push({
          pid: storePid,
          id: agreementKey,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      writes,
      warning: `A ruleset now exists for ${storePid}/${agreementKey} (candidates: ${mergedValue}) — a Binary Parameter rule named "${newTarget}" must still be authored under ${storePid} before the framework can disambiguate between them at runtime.`,
      followUp: { storePid, ruleName: newTarget },
    };
  }

  /** Upserts each parameter in turn (best-effort), collecting a per-parameter outcome. */
  private async runWrites(
    routeKey: string,
    writes: readonly ParameterWrite[],
    ...rulesets: readonly (RulesetHousekeepingResult | undefined)[]
  ): Promise<RouteDeployResult> {
    const engine = this.engineFactory();
    const created: DeployedParameter[] = rulesets
      .filter((r): r is RulesetHousekeepingResult => r !== undefined)
      .flatMap((r) => r.writes);
    for (const write of writes) {
      try {
        await engine.partnerDirectory.saveStringParameter(write.pid, write.id, write.value);
        created.push({ pid: write.pid, id: write.id, status: "ok", error: undefined });
      } catch (error) {
        created.push({
          pid: write.pid,
          id: write.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const resolved = rulesets.filter((r): r is RulesetHousekeepingResult => r !== undefined);
    const warnings = resolved.map((r) => r.warning);
    const rulesetFollowUps = resolved.map((r) => r.followUp);
    return {
      routeKey,
      created,
      allSucceeded: created.every((parameter) => parameter.status === "ok"),
      warnings: warnings.length > 0 ? warnings : undefined,
      rulesetFollowUps: rulesetFollowUps.length > 0 ? rulesetFollowUps : undefined,
    };
  }

  private static buildWrites(
    request: RouteDeployRequest,
    routeKey: string,
  ): readonly ParameterWrite[] {
    const { targetPid } = request;
    // Route-key parameter Ids use the CPI-legal storage form (`*` → `~`); the agreement key never
    // contains `*` (sender/receiver are always present).
    const storageKey = toStorageKey(routeKey);
    const writes: ParameterWrite[] = [];

    // Agreement: map the sender/receiver pair to the target PID (normal track only — a ruleset
    // collision is escalated separately via applyRulesetHousekeeping, never a plain overwrite).
    if (request.track === "normal") {
      writes.push({
        pid: JMS_AGREEMENTS_PID,
        id: standardAgreementKey(request.idoc.sndprn, request.idoc.rcvprn),
        value: targetPid,
      });
    }

    // Destination: QUEUE_JMS_{routeKey} = queue name (one hop); ROUTE_JMS_{routeKey} = endpoint URI —
    // this is also where the JMS side's "final endpoint" lives (there is no separate router endpoint).
    writes.push(
      { pid: targetPid, id: `QUEUE_JMS_${storageKey}`, value: request.targetQueue },
      { pid: targetPid, id: `ROUTE_JMS_${storageKey}`, value: request.endpointUri },
    );

    if (request.customMapping?.enabled === true) {
      writes.push(
        { pid: targetPid, id: "X-Routing", value: "true" },
        { pid: targetPid, id: "X-Routing-Condition", value: request.customMapping.condition },
        { pid: targetPid, id: `RCV_JMS_${storageKey}`, value: request.customMapping.address },
      );
    }

    if (request.alerting !== undefined) {
      const alerting = request.alerting;
      CoeRouterService.pushIfSet(writes, targetPid, "X-Exception-To", alerting.to);
      CoeRouterService.pushIfSet(writes, targetPid, "X-Exception-Cc", alerting.cc);
      CoeRouterService.pushIfSet(writes, targetPid, "X-Exception-Bcc", alerting.bcc);
      CoeRouterService.pushIfSet(writes, targetPid, "X-Exception-Subject", alerting.subject);
      writes.push({ pid: targetPid, id: "X-Max-Retries", value: String(alerting.maxRetries) });
    }

    if (request.optimization !== undefined) {
      const optimization = request.optimization;
      writes.push(
        { pid: targetPid, id: "X-Priority", value: optimization.priority },
        { pid: targetPid, id: "X-Sync", value: String(optimization.sync) },
        {
          pid: targetPid,
          id: "X-Force-Cache-Refresh",
          value: String(optimization.forceCacheRefresh),
        },
      );
    }
    return writes;
  }

  /**
   * Assembles the Common Router parameter set:
   * - `_Maintain_Router_Agreements` / `.{SNDPRN}.{RCVPRN}` → `routerPid` (normal track only — a
   *   ruleset collision is escalated separately via applyRulesetHousekeeping).
   * - under `routerPid`: `ROUTE_{routeKey}` → `finalTargetPid` directly (one hop; no `Target_PID` /
   *   `X-Route-Key` / `Clean_Route_Key` reference params — the agreement value already *is* the
   *   target PID, and there is no separate router endpoint parameter).
   */
  private static buildRouterWrites(
    request: RouterDeployRequest,
    routeKey: string,
  ): readonly ParameterWrite[] {
    const { routerPid, finalTargetPid } = request;
    const storageKey = toStorageKey(routeKey);
    const writes: ParameterWrite[] = [];

    if (request.track === "normal") {
      writes.push({
        pid: ROUTER_AGREEMENTS_PID,
        id: standardAgreementKey(request.idoc.sndprn, request.idoc.rcvprn),
        value: routerPid,
      });
    }

    writes.push({ pid: routerPid, id: `ROUTE_${storageKey}`, value: finalTargetPid });
    return writes;
  }

  private static pushIfSet(writes: ParameterWrite[], pid: string, id: string, value: string): void {
    if (value.trim() !== "") {
      writes.push({ pid, id, value });
    }
  }
}

/** Shared service instance. */
export const coeRouterService = new CoeRouterService();
