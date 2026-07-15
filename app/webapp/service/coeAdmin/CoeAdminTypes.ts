/**
 * Client-side mirror of the CoE Admin backend DTOs (`/api/v1/coe-admin`, composed entirely from the
 * Operations Engine's Partner Directory engine). These are the only shapes the workspace consumes —
 * no SDK, OData or CPI shape ever reaches the UI.
 */

/** The four global framework settings, read from `.SYS_JMS_FRAMEWORK`. Any field is `undefined` when not yet configured. */
export interface CoeGlobalSettings {
  readonly environment: string | undefined;
  readonly defaultRetries: number | undefined;
  readonly defaultExceptionTo: string | undefined;
  readonly defaultEgressUri: string | undefined;
  readonly lastModifiedBy: string | undefined;
  readonly lastModifiedAt: string | undefined;
}

/** The update payload sent on save (every field required — matches the backend validation). */
export interface CoeGlobalSettingsUpdate {
  readonly environment: string;
  readonly defaultRetries: number;
  readonly defaultExceptionTo: string;
  readonly defaultEgressUri: string;
}
