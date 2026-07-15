/**
 * Client-side mirror of the CoE Route Wizard backend DTOs (`/api/v1/coe-router`, composed entirely
 * from the Operations Engine's Partner Directory engine). These are the only shapes the workspace
 * consumes — no SDK, OData or CPI shape ever reaches the UI.
 */

/** Which agreement track a route creation falls into (spec §4 Step 2). */
export type AgreementTrack = "normal" | "ruleset";

/** The parsed IDoc control-record identifiers plus the intended target partner. */
export interface RouteAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly targetPid: string;
}

/** Result of the agreement collision check. */
export interface RouteAgreementCheck {
  readonly track: AgreementTrack;
  readonly agreementStorePid: string;
  readonly agreementKey: string;
  readonly specificAgreementKey: string;
  readonly agreementExists: boolean;
  readonly existingTargetPid: string | undefined;
  readonly rulesetKey: string | undefined;
}

/** The six IDoc identifiers the route key is built from. */
export interface RouteIdoc {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly idoctyp: string;
  readonly sndpor: string;
  readonly rcvpor: string;
}

export interface CustomMappingSettings {
  readonly enabled: boolean;
  readonly condition: "pre" | "post";
  readonly address: string;
}

export interface AlertingSettings {
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly maxRetries: number;
}

export interface OptimizationSettings {
  readonly priority: string;
  readonly sync: boolean;
  readonly forceCacheRefresh: boolean;
}

/** The full deploy request the wizard submits. */
export interface RouteDeployRequest {
  readonly idoc: RouteIdoc;
  readonly targetPid: string;
  readonly targetQueue: string;
  readonly endpointUri: string;
  readonly track: AgreementTrack;
  readonly rulesetKey?: string;
  readonly customMapping?: CustomMappingSettings;
  readonly alerting?: AlertingSettings;
  readonly optimization?: OptimizationSettings;
}

/** The outcome of one attempted parameter write during deploy. */
export interface DeployedParameter {
  readonly pid: string;
  readonly id: string;
  readonly status: "ok" | "failed";
  readonly error: string | undefined;
}

/** A still-missing Binary Parameter rule a ruleset escalation now requires — deep-links into the Rule Builder. */
export interface RulesetFollowUp {
  readonly storePid: string;
  readonly ruleName: string;
}

/** The result of a deploy. */
export interface RouteDeployResult {
  readonly routeKey: string;
  readonly created: readonly DeployedParameter[];
  readonly allSucceeded: boolean;
  /** Follow-up actions the deploy could not perform itself (e.g. a still-missing Binary Parameter rule). */
  readonly warnings?: readonly string[];
  /** Structured counterpart to `warnings` — one entry per ruleset escalation, for deep-linking. */
  readonly rulesetFollowUps?: readonly RulesetFollowUp[];
}

// --- Common Router (spec §4 — "Create only Common Router") ---------------------------------------

/** The parsed IDoc identifiers plus the intended Common Router package, for the router agreement check. */
export interface RouterAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly routerPid: string;
}

/** The Common Router deploy request the flow submits. */
export interface RouterDeployRequest {
  readonly idoc: RouteIdoc;
  readonly routerPid: string;
  readonly finalTargetPid: string;
  readonly track: AgreementTrack;
  readonly rulesetKey?: string;
}

// --- Combined: "Create JMS + Common Router Connection" -------------------------------------------

/** The parsed IDoc identifiers plus both intended targets, for the combined collision check. */
export interface CombinedAgreementQuery {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly targetPid: string;
  readonly routerPid: string;
}

/** Both agreement checks run side by side — the JMS destination track and the Common Router track. */
export interface CombinedAgreementCheck {
  readonly jms: RouteAgreementCheck;
  readonly router: RouteAgreementCheck;
}

/** The combined deploy request the flow submits. */
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

// --- Parameter Registry — agreement lookup + reverse "present in" search (3-box redesign) --------

/** Which agreement registry to read. */
export type AgreementRegistryType = "jms" | "router";

/** A read-only sender/receiver pair lookup — no intended value, unlike {@link RouteAgreementQuery}. */
export interface AgreementLookupQuery {
  readonly type: AgreementRegistryType;
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp?: string;
}

/** One ruleset candidate, with whether its disambiguation rule has been authored (Visual Rule Builder). */
export interface RulesetCandidate {
  readonly targetPid: string;
  readonly ruleAuthored: boolean;
}

/** Result of a read-only agreement lookup by sender/receiver pair. */
export interface AgreementLookup {
  readonly storePid: string;
  readonly agreementKey: string;
  readonly specificAgreementKey: string | undefined;
  readonly found: boolean;
  readonly kind: "none" | "normal" | "ruleset";
  readonly targetPid: string | undefined;
  readonly candidates: readonly RulesetCandidate[] | undefined;
}

/** One agreement entry (in either registry) whose value references the searched target PID. */
export interface PresentInEntry {
  readonly storePid: string;
  readonly id: string;
  readonly value: string;
  readonly isRuleset: boolean;
}

/** Result of the reverse lookup: every JMS/Router agreement entry that routes to a given target PID. */
export interface PresentIn {
  readonly targetPid: string;
  readonly entries: readonly PresentInEntry[];
}
