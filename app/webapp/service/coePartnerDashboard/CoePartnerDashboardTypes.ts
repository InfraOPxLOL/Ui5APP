/**
 * Client-side mirror of the Global Partner Master-Detail Dashboard backend DTOs
 * (`/api/v1/coe-partner-dashboard`). The only shapes the workspace consumes — no SDK/OData/CPI shape
 * ever reaches the UI.
 */

/** One entry in the master list — a Partner ID and how many agreements reference it. */
export interface PartnerSummary {
  readonly pid: string;
  readonly jmsAgreementCount: number;
  readonly routerAgreementCount: number;
}

/** The full master list. */
export interface PartnerList {
  readonly partners: readonly PartnerSummary[];
}

/** A JMS destination route reverse-engineered from `QUEUE_JMS_{routeKey}`/`ROUTE_JMS_{routeKey}`/`RCV_JMS_{routeKey}`. */
export interface DecodedJmsRoute {
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
export interface DecodedRouterRoute {
  readonly routeKey: string;
  readonly idoctyp: string;
  readonly mestyp: string;
  readonly sndpor: string;
  readonly sndprn: string;
  readonly rcvpor: string;
  readonly rcvprn: string;
  readonly finalTargetPid: string | undefined;
}

/** A parameter under the partner PID that isn't part of a recognized route. */
export interface OtherParameter {
  readonly id: string;
  readonly value: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** One agreement entry (in either registry) that routes to this partner. */
export interface ReferencedByEntry {
  readonly storePid: string;
  readonly id: string;
  readonly value: string;
  readonly isRuleset: boolean;
  readonly ruleAuthored: boolean | undefined;
}

/** The full reverse-engineered detail view for one Partner ID. */
export interface PartnerDetail {
  readonly pid: string;
  readonly jmsRoutes: readonly DecodedJmsRoute[];
  readonly routerRoutes: readonly DecodedRouterRoute[];
  readonly otherParameters: readonly OtherParameter[];
  readonly referencedBy: readonly ReferencedByEntry[];
}
