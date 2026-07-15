/** Lifecycle state of a published API proxy, as tracked by API Management. */
export type ApiStatus = "PUBLISHED" | "UNPUBLISHED" | "DEPRECATED";

/**
 * A published API proxy tracked by SAP Integration Suite's API Management capability, with its
 * current-day traffic summary.
 */
export interface ApiDto {
  readonly apiName: string;
  readonly proxyName: string;
  readonly status: ApiStatus;
  readonly version: string;
  readonly callsToday: number;
  readonly avgLatencyMs: number;
}
