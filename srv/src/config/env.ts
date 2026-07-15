/**
 * Typed, validated process environment loader.
 *
 * This is the only place `process.env` is read directly. It validates on first import and throws
 * immediately if a required variable is missing or malformed, so the app fails fast at boot rather
 * than on the first request (architecture §11).
 */

/**
 * How {@link QueueEngine} (in `operations/engines`) discovers which JMS queues exist.
 * - `Fetch_Specific` — only the queues declared in `config/queues.json` are checked; a queue the
 *   tenant actually has but that isn't listed there is invisible to the platform.
 * - `Fetch_All` — `config/queues.json`'s queue list is ignored; every queue the tenant itself
 *   reports is discovered live, using `queues.json` only as an optional display-name/retry-policy
 *   overlay for queues it happens to also name.
 */
export type QueueDiscoveryMode = "Fetch_All" | "Fetch_Specific";

/** Strongly-typed view of the process environment the backend depends on. */
export interface Env {
  /** HTTP port. Cloud Foundry injects `PORT`; defaults to 4004 for local runs. */
  readonly port: number;
  /** Deployment stage label. */
  readonly nodeEnv: "development" | "production" | "test";
  /**
   * Runtime log-level override (`LOG_LEVEL`). Optional: when unset, the level from
   * `config/logging.json` applies. Kept as an env override so operators can raise verbosity on a
   * running deployment without editing configuration files.
   */
  readonly logLevel: string | undefined;
  /**
   * Directory holding the split configuration files (`application.json`, `tenants.json`, …).
   * Relative values (default `config`) are searched for from the working directory upward;
   * `CONFIG_DIR` may set an absolute path.
   */
  readonly configDir: string;
  /**
   * Credentials for the SDK's own client to the SAP BTP Destination service (`DESTINATION_SERVICE_*`).
   * `undefined` when unset — valid whenever `connectivity.json`'s `destinationDiscovery` is `static`
   * (or `mode` is `mock`); required only when it is `btp`, checked at the point of use rather than
   * here so a deployment that never needs it never has to set it.
   */
  readonly destinationService: DestinationServiceEnv | undefined;
  /**
   * JMS queue discovery mode (`JMS_QUEUE_DISCOVERY_MODE`). Defaults to `"Fetch_Specific"`, matching
   * every prior release's behaviour. Added because a tenant's real queue names (e.g. a trial
   * tenant's single `PIPQ1`) rarely match placeholder scaffold names in `config/queues.json`;
   * `Fetch_All` lets the platform work against whatever actually exists without hand-editing
   * configuration per tenant. See {@link QueueDiscoveryMode}.
   */
  readonly jmsQueueDiscoveryMode: QueueDiscoveryMode;
}

/** Non-config, secret connection details for the SDK's own call to the BTP Destination service. */
export interface DestinationServiceEnv {
  /** Destination-configuration API base URL. */
  readonly url: string;
  /** OAuth 2.0 token endpoint used to authenticate to the Destination service itself. */
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "4004", 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${value ?? ""}"`);
  }
  return port;
}

function parseNodeEnv(value: string | undefined): Env["nodeEnv"] {
  const v = value ?? "development";
  if (v !== "development" && v !== "production" && v !== "test") {
    throw new Error(`Invalid NODE_ENV value: "${v}"`);
  }
  return v;
}

function parseQueueDiscoveryMode(value: string | undefined): QueueDiscoveryMode {
  const v = value ?? "Fetch_Specific";
  if (v !== "Fetch_All" && v !== "Fetch_Specific") {
    throw new Error(
      `Invalid JMS_QUEUE_DISCOVERY_MODE value: "${v}" (expected "Fetch_All" or "Fetch_Specific")`,
    );
  }
  return v;
}

function parseDestinationServiceEnv(): DestinationServiceEnv | undefined {
  const url = process.env.DESTINATION_SERVICE_URL;
  const tokenUrl = process.env.DESTINATION_SERVICE_TOKEN_URL;
  const clientId = process.env.DESTINATION_SERVICE_CLIENT_ID;
  const clientSecret = process.env.DESTINATION_SERVICE_CLIENT_SECRET;
  const set = [url, tokenUrl, clientId, clientSecret];
  if (set.every((value) => value === undefined)) {
    return undefined;
  }
  if (
    url === undefined ||
    tokenUrl === undefined ||
    clientId === undefined ||
    clientSecret === undefined
  ) {
    throw new Error(
      "Incomplete DESTINATION_SERVICE_* environment configuration: DESTINATION_SERVICE_URL, " +
        "_TOKEN_URL, _CLIENT_ID and _CLIENT_SECRET must all be set together.",
    );
  }
  return { url, tokenUrl, clientId, clientSecret };
}

/**
 * Loads and validates the environment.
 * @returns the typed, validated environment.
 * @throws {Error} if any required variable is invalid.
 */
export function loadEnv(): Env {
  return {
    port: parsePort(process.env.PORT),
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    logLevel: process.env.LOG_LEVEL,
    configDir: process.env.CONFIG_DIR ?? "config",
    destinationService: parseDestinationServiceEnv(),
    jmsQueueDiscoveryMode: parseQueueDiscoveryMode(process.env.JMS_QUEUE_DISCOVERY_MODE),
  };
}

/** The validated environment, resolved once at module load. */
export const env: Env = loadEnv();

/**
 * Reads one tenant-scoped secret for `static` destination discovery (architecture: Authentication
 * Framework — "Credentials must come from configuration": the auth *strategy* lives in
 * `connectivity.json`'s `tenantAuth`; the actual secret value is environment-scoped like every other
 * credential in this codebase, and this is the one function that reads it).
 *
 * Convention: `CPI_<TENANTID>_<KEY>`, tenant id upper-cased with non-alphanumeric characters
 * replaced by `_` (e.g. tenant `primary`, key `CLIENT_SECRET` → `CPI_PRIMARY_CLIENT_SECRET`).
 * @param tenantId the tenant id (`tenants.json`).
 * @param key which credential to read.
 * @returns the secret value, or `undefined` when not set.
 */
export function getTenantCredential(
  tenantId: string,
  key: "CLIENT_ID" | "CLIENT_SECRET" | "USERNAME" | "PASSWORD",
): string | undefined {
  const normalizedTenantId = tenantId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return process.env[`CPI_${normalizedTenantId}_${key}`];
}
