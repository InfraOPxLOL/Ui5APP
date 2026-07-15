/**
 * DTOs for the Global Partner Master-Detail Dashboard (Parameter Registry's companion view). Composed
 * entirely from the Operations Engine's Partner Directory engine, reusing `coe-router`'s route-key
 * conventions (`buildRouteKey`/`toStorageKey`/`parseRouteKey`/`fromStorageKey`) to reverse-engineer a
 * Partner ID's raw string parameters back into structured routes, so a developer can browse what a
 * partner already has configured without hand-decoding parameter Ids.
 *
 * There is no tenant capability to enumerate every Partner ID, so the **master list is derived**:
 * every distinct value (or `RULESET_` candidate) referenced by either agreement registry
 * (`_Maintain_JMS_Agreements` / `_Maintain_Router_Agreements`) is a "known partner". A Partner ID with
 * parameters but never referenced by an agreement will not appear — General Search's "By Partner ID"
 * mode remains the fallback for looking up an arbitrary PID directly.
 */

/** One entry in the master list — a Partner ID and how many agreements reference it. */
export interface PartnerSummaryDto {
  readonly pid: string;
  readonly jmsAgreementCount: number;
  readonly routerAgreementCount: number;
}

/** The full master list. */
export interface PartnerListDto {
  readonly partners: readonly PartnerSummaryDto[];
}

/** A JMS destination route reverse-engineered from `QUEUE_JMS_{routeKey}`/`ROUTE_JMS_{routeKey}`/`RCV_JMS_{routeKey}`. */
export interface DecodedJmsRouteDto {
  readonly routeKey: string;
  readonly idoctyp: string;
  readonly mestyp: string;
  readonly sndpor: string;
  readonly sndprn: string;
  readonly rcvpor: string;
  readonly rcvprn: string;
  readonly queue: string | undefined;
  readonly endpointUri: string | undefined;
  readonly mappingAddress: string | undefined;
}

/** A Common Router route reverse-engineered from `ROUTE_{routeKey}`. */
export interface DecodedRouterRouteDto {
  readonly routeKey: string;
  readonly idoctyp: string;
  readonly mestyp: string;
  readonly sndpor: string;
  readonly sndprn: string;
  readonly rcvpor: string;
  readonly rcvprn: string;
  readonly finalTargetPid: string | undefined;
}

/** A parameter under the partner PID that isn't part of a recognized route (e.g. `X-Priority`, `X-Max-Retries`). */
export interface OtherParameterDto {
  readonly id: string;
  readonly value: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** One agreement entry (in either registry) that routes to this partner — the reverse lookup, per-candidate rule status included. */
export interface ReferencedByEntryDto {
  readonly storePid: string;
  readonly id: string;
  readonly value: string;
  readonly isRuleset: boolean;
  /** Whether this partner's Binary Parameter disambiguation rule has been authored — only meaningful when `isRuleset`. */
  readonly ruleAuthored: boolean | undefined;
}

/** The full reverse-engineered detail view for one Partner ID. */
export interface PartnerDetailDto {
  readonly pid: string;
  readonly jmsRoutes: readonly DecodedJmsRouteDto[];
  readonly routerRoutes: readonly DecodedRouterRouteDto[];
  readonly otherParameters: readonly OtherParameterDto[];
  readonly referencedBy: readonly ReferencedByEntryDto[];
}
