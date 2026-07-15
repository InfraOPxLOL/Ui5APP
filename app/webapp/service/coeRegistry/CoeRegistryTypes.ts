/**
 * Client-side mirror of the Global Partner Parameter Registry backend DTOs
 * (`/api/v1/coe-registry`). The only shapes the workspace consumes — no SDK/OData/CPI shape ever
 * reaches the UI.
 */

/** One registry row — a Partner Directory string parameter with its audit fields. */
export interface RegistryParameter {
  readonly pid: string;
  readonly id: string;
  value: string;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** The parameters under one Partner ID. */
export interface RegistryList {
  readonly pid: string;
  readonly parameters: readonly RegistryParameter[];
}

/** The edit payload sent on save. */
export interface RegistryUpdate {
  readonly pid: string;
  readonly id: string;
  readonly value: string;
}
