import type { CreationFlowId } from "../../model/coeRouter/HubModel";

/**
 * Shared deep-link payload shape for "edit an existing route" — encoded by the Global Partner
 * Dashboard (a decoded route's Edit button) and decoded by the Creation Hub, which opens the matching
 * flow and hands the state to that flow controller's `applyDeepLinkPrefill`. Every field pre-fills a
 * model value only; nothing is deployed automatically — the developer still walks the wizard's steps
 * and must explicitly click Deploy.
 */

export interface DeepLinkIdoc {
  readonly sndprn: string;
  readonly rcvprn: string;
  readonly mestyp: string;
  readonly idoctyp: string;
  readonly sndpor: string;
  readonly rcvpor: string;
}

export interface DeepLinkCustomMapping {
  readonly enabled: boolean;
  readonly condition: "pre" | "post";
  readonly address: string;
}

export interface DeepLinkAlerting {
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly maxRetries: number;
}

export interface DeepLinkOptimization {
  readonly priority: string;
  readonly sync: boolean;
  readonly forceCacheRefresh: boolean;
}

export interface DeepLinkAdvanced {
  readonly customMapping?: DeepLinkCustomMapping;
  readonly alerting?: DeepLinkAlerting;
  readonly optimization?: DeepLinkOptimization;
}

/**
 * The full prefill payload. `flow` selects which nested Creation Hub flow to open; the remaining
 * fields are only meaningful for the flows that use them (`targetPid`/`targetQueue`/`endpointUri` —
 * `jmsEntry` + `jmsRouter`; `routerPid`/`finalTargetPid` — `routerOnly`; `routerPid` alone —
 * `jmsRouter`, where it doubles as both legs' router package; `advanced` — `jmsEntry` + `jmsRouter`).
 */
export interface RouteWizardPrefillState {
  readonly flow: CreationFlowId;
  readonly idoc: DeepLinkIdoc;
  readonly targetPid?: string;
  readonly targetQueue?: string;
  readonly endpointUri?: string;
  readonly routerPid?: string;
  readonly finalTargetPid?: string;
  readonly advanced?: DeepLinkAdvanced;
}
