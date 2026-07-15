/**
 * Data transfer objects for the CoE Route Wizard module (spec §4/§5 — "Create JMS + Common Router
 * Connection"). Every shape is composed from the Operations Engine's Partner Directory engine; the
 * module never leaks an SDK/CPI/OData shape.
 *
 * Partner Directory model (confirmed against the live tenant, corrected against user feedback):
 * - An **agreement** is a string parameter under the fixed registry PID `_Maintain_JMS_Agreements`
 *   (JMS) or `_Maintain_Router_Agreements` (Common Router): id `.{SNDPRN}.{RCVPRN}` (standard) or
 *   `.{MESTYP}.{SNDPRN}.{RCVPRN}` (specific); its **value is the target Partner ID** directly — this
 *   value *is* what earlier drafts wrongly duplicated into a separate `Target_PID` parameter; there is
 *   no such parameter.
 * - The **route key** is the 6-part `.{IDOCTYP}.{MESTYP}.{SNDPOR}.{SNDPRN}.{RCVPOR}.{RCVPRN}`, with
 *   `*` substituted for any part absent/unparsable in the EDI_DC40 control record.
 * - Under the **target PID**, `QUEUE_JMS_{routeKey}` holds the queue name and `ROUTE_JMS_{routeKey}`
 *   the endpoint URI, both directly (one hop each) — this is also where the JMS side's "final
 *   endpoint" lives; the Common Router side has no separate endpoint parameter of its own.
 * - Under a Common Router package PID, `ROUTE_{routeKey}` holds the final receiving Partner ID
 *   directly (one hop) — no `X-Route-Key`/`Clean_Route_Key` indirection.
 *
 * **Ruleset escalation** (a sender/receiver pair legitimately routes to more than one target — spec
 * §4 Step 2 "shared partner context"): the plain `.{SNDPRN}.{RCVPRN}` agreement is deleted and
 * replaced with `RULESET_.{SNDPRN}.{RCVPRN}` holding a comma-separated list of every candidate target
 * PID sharing the pair. Once a pair has been escalated this way it *stays* a ruleset (the plain key
 * never comes back). Disambiguating between the candidates at runtime requires a Binary Parameter
 * rule named after each candidate under the same registry PID — authoring that rule is the Visual
 * Rule Builder's job (not yet built), so every ruleset deploy returns a `warnings` entry flagging the
 * still-missing rule rather than fabricating one.
 */

/** Which agreement track a route creation falls into (spec §4 Step 2 — "Logical Decision Matrix"). */
export type AgreementTrack = "normal" | "ruleset";

/** The fixed registry PID under which JMS agreements are stored. */
export const JMS_AGREEMENTS_PID = "_Maintain_JMS_Agreements";

/** The fixed registry PID under which Common Router agreements are stored (mirrors {@link JMS_AGREEMENTS_PID}). */
export const ROUTER_AGREEMENTS_PID = "_Maintain_Router_Agreements";

// --- Parameter Registry — agreement lookup + reverse "present in" search -------------------------

/** Which agreement registry to read (spec §2, Tile 3 — Parameter Registry's 3-box redesign). */
export type AgreementRegistryType = "jms" | "router";

/** Query for a read-only sender/receiver pair lookup (no intended value — pure read, not a collision check). */
export interface AgreementLookupQuery {
  readonly type: AgreementRegistryType;
  readonly sndprn: string;
  readonly rcvprn: string;
  /** When given, also probes the message-type-specific key `.{MESTYP}.{SNDPRN}.{RCVPRN}`. */
  readonly mestyp?: string;
}

/** One ruleset candidate, with whether its disambiguation rule has been authored (Visual Rule Builder). */
export interface RulesetCandidateDto {
  readonly targetPid: string;
  readonly ruleAuthored: boolean;
}

/** Result of a read-only agreement lookup by sender/receiver pair. */
export interface AgreementLookupDto {
  readonly storePid: string;
  readonly agreementKey: string;
  readonly specificAgreementKey: string | undefined;
  readonly found: boolean;
  readonly kind: "none" | "normal" | "ruleset";
  /** Set when `kind === "normal"`. */
  readonly targetPid: string | undefined;
  /** Set when `kind === "ruleset"` — every candidate sharing the pair, plus its rule-authored status. */
  readonly candidates: readonly RulesetCandidateDto[] | undefined;
}

/** One agreement entry (in either registry) whose value references the searched target PID. */
export interface PresentInEntryDto {
  readonly storePid: string;
  readonly id: string;
  readonly value: string;
  readonly isRuleset: boolean;
}

/** Result of the reverse lookup: every JMS/Router agreement entry that routes to a given target PID. */
export interface PresentInDto {
  readonly targetPid: string;
  readonly entries: readonly PresentInEntryDto[];
}

/** The parsed IDoc control-record identifiers driving agreement resolution. */
export interface RouteAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  /** The target partner the developer intends to route to (drives the normal-vs-ruleset decision). */
  readonly targetPid: string;
}

/** Result of the agreement collision check (spec §4 Step 2). */
export interface RouteAgreementCheckDto {
  readonly track: AgreementTrack;
  /** The registry PID agreements are stored under (`_Maintain_JMS_Agreements`). */
  readonly agreementStorePid: string;
  /** The standard agreement key probed (`.{SNDPRN}.{RCVPRN}`). */
  readonly agreementKey: string;
  /** The message-type-specific agreement key probed (`.{MESTYP}.{SNDPRN}.{RCVPRN}`). */
  readonly specificAgreementKey: string;
  /** Whether any agreement already exists for this sender/receiver pair. */
  readonly agreementExists: boolean;
  /** The existing target PID (normal) or the comma-separated candidate list (already a ruleset). */
  readonly existingTargetPid: string | undefined;
  /** The ruleset agreement key prepared/already present on a shared-partner collision (`RULESET_.{SNDPRN}.{RCVPRN}`). */
  readonly rulesetKey: string | undefined;
}

/** Optional custom-mapping-exit settings (spec §5 Tab A). */
export interface CustomMappingSettings {
  readonly enabled: boolean;
  readonly condition: "pre" | "post";
  readonly address: string;
}

/** Optional alerting/DLQ settings (spec §5 Tab B). Max retries is capped at 5 (framework limit). */
export interface AlertingSettings {
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly maxRetries: number;
}

/** Optional optimization/tracing settings (spec §5 Tab C). */
export interface OptimizationSettings {
  readonly priority: string;
  readonly sync: boolean;
  readonly forceCacheRefresh: boolean;
}

/** The full six-part IDoc identifier set the route key is built from. */
export interface RouteIdoc {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly idoctyp: string;
  readonly sndpor: string;
  readonly rcvpor: string;
}

/** The full deploy request the wizard submits. */
export interface RouteDeployRequest {
  readonly idoc: RouteIdoc;
  /** The target Partner ID whose parameters hold the route (e.g. `Custom_Integration_Package`). */
  readonly targetPid: string;
  readonly targetQueue: string;
  readonly endpointUri: string;
  readonly track: AgreementTrack;
  readonly rulesetKey?: string;
  readonly customMapping?: CustomMappingSettings;
  readonly alerting?: AlertingSettings;
  readonly optimization?: OptimizationSettings;
}

/** The outcome of one attempted parameter write (create/update or ruleset-escalation delete) during deploy. */
export interface DeployedParameter {
  readonly pid: string;
  readonly id: string;
  readonly status: "ok" | "failed";
  readonly error: string | undefined;
}

/**
 * A still-missing Binary Parameter rule a ruleset escalation now requires — structured so the UI can
 * deep-link straight into the Visual Rule Builder pre-filled, rather than parsing the free-text
 * `warnings` message.
 */
export interface RulesetFollowUp {
  /** The registry PID the rule must be authored under (matches its `RULESET_` entry's PID). */
  readonly storePid: string;
  /** The rule name — the exact candidate just merged into the `RULESET_` comma list. */
  readonly ruleName: string;
}

/** The result of a deploy (spec §4 Step "transactional orchestration" — best-effort, per-parameter). */
export interface RouteDeployResult {
  /** The 6-part route key the parameters were keyed by. */
  readonly routeKey: string;
  readonly created: readonly DeployedParameter[];
  readonly allSucceeded: boolean;
  /** Follow-up actions the deploy could not perform itself (e.g. a still-missing Binary Parameter rule). */
  readonly warnings?: readonly string[];
  /** Structured counterpart to `warnings` — one entry per ruleset escalation, for deep-linking. */
  readonly rulesetFollowUps?: readonly RulesetFollowUp[];
}

// --- Common Router (spec §4 — "Create only Common Router") ---------------------------------------

/** The parsed IDoc identifiers plus the intended Common Router package, driving router-agreement resolution. */
export interface RouterAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  /** The Common Router package PID the partner pair would be routed through. */
  readonly routerPid: string;
}

/**
 * A Common Router deploy: register the route→target mapping under a shared Common Router package and
 * point the partner pair's agreement at that package. Writes:
 * - `_Maintain_Router_Agreements` / `.{SNDPRN}.{RCVPRN}` → `routerPid` (normal track only).
 * - under `routerPid`: `ROUTE_{routeKey}` → `finalTargetPid` directly (one hop, no reference params).
 */
export interface RouterDeployRequest {
  readonly idoc: RouteIdoc;
  /** The Common Router package PID that owns the route→target mapping. */
  readonly routerPid: string;
  /** The final destination partner the route key resolves to. */
  readonly finalTargetPid: string;
  readonly track: AgreementTrack;
  readonly rulesetKey?: string;
}

// --- Combined: "Create JMS + Common Router Connection" (spec §4, Tile 1) -------------------------

/** The parsed IDoc identifiers plus both intended targets, for the combined collision check. */
export interface CombinedAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly targetPid: string;
  readonly routerPid: string;
}

/** Both agreement checks run side by side — the JMS destination track and the Common Router track. */
export interface CombinedAgreementCheckDto {
  readonly jms: RouteAgreementCheckDto;
  readonly router: RouteAgreementCheckDto;
}

/**
 * The full combined deploy request: everything {@link RouteDeployRequest} writes, plus the Common
 * Router registration for the same route key, pointed at the same `targetPid` (the JMS destination
 * *is* the Common Router's final target — one partner, one route).
 */
export interface CombinedDeployRequest {
  readonly idoc: RouteIdoc;
  readonly targetPid: string;
  readonly targetQueue: string;
  readonly endpointUri: string;
  readonly jmsTrack: AgreementTrack;
  readonly jmsRulesetKey?: string;
  readonly customMapping?: CustomMappingSettings;
  readonly alerting?: AlertingSettings;
  readonly optimization?: OptimizationSettings;
  readonly routerPid: string;
  readonly routerTrack: AgreementTrack;
  readonly routerRulesetKey?: string;
}
