/**
 * Data transfer objects for the CoE Admin module (spec §3 — Global Framework Configurations). Every
 * shape here is composed from the Operations Engine's Partner Directory engine; the module never
 * leaks an SDK/CPI/OData shape. The four fields map 1:1 to string parameters under the master
 * Partner ID `.SYS_JMS_FRAMEWORK`.
 *
 * Any field is `undefined` when that parameter is not yet set on the tenant — an honest "not
 * configured" state, never a fabricated default (the UI initializes its own defaults for editing).
 */
export interface CoeGlobalSettingsDto {
  /** `Environment` — the deployment landscape (`PRD` | `QAS` | `DEV`). */
  readonly environment: string | undefined;
  /** `DEFAULT_RETRIES` — the global rollback-retry failsafe (1–10). */
  readonly defaultRetries: number | undefined;
  /** `Default_Exception_To` — the global CoE support mailbox. */
  readonly defaultExceptionTo: string | undefined;
  /** `X-Default-Egress-URI` — the partner-agnostic failsafe egress path. */
  readonly defaultEgressUri: string | undefined;
  /** Who last modified any of these parameters, when the tenant records it. */
  readonly lastModifiedBy: string | undefined;
  /** When any of these parameters was last modified (ISO 8601, the most recent across the four). */
  readonly lastModifiedAt: string | undefined;
}

/** The validated update payload accepted by `PUT /api/v1/coe-admin`. */
export interface CoeGlobalSettingsUpdate {
  readonly environment: string;
  readonly defaultRetries: number;
  readonly defaultExceptionTo: string;
  readonly defaultEgressUri: string;
}
