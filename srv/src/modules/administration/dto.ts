/**
 * Data transfer objects for the Administration module. These are the platform's stable shapes; the
 * service maps raw configuration/CPI payloads into them so no internal shape leaks past the
 * service layer.
 */

/** A single Administration row (one configured destination/tenant). */
export interface AdministrationDto {
  readonly destinationName: string;
  readonly tenantLabel: string;
  readonly status: string;
  readonly baseUrl: string;
}

/** Client-facing projection of one configured tenant (server-only fields excluded). */
export interface ClientTenantDto {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly region: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly displayColor: string;
  readonly displayIcon: string;
  readonly refreshProfile: string;
  readonly default: boolean;
}

/** Client-facing projection of one configured queue. */
export interface ClientQueueDto {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly deadLetterQueue: string;
  readonly retryQueue: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly retryStrategy: string;
  readonly maxRetries: number;
}

/**
 * Client-facing runtime configuration projection, assembled from the `config/` domain files.
 * Contains everything the frontend needs to render and nothing server-only: destination names
 * appear only in the Administration module's own list (an admin surface), and `security.json` /
 * `logging.json` internals are never exposed except the client-logging knobs the browser needs.
 */
export interface ClientConfigDto {
  readonly application: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly vendor: string;
    readonly supportContact: string;
    readonly documentationUrl: string;
  };
  readonly environment: { readonly name: string; readonly label: string; readonly kind: string };
  readonly tenants: readonly ClientTenantDto[];
  readonly queues: readonly ClientQueueDto[];
  readonly features: {
    readonly modules: Readonly<Record<string, { readonly enabled: boolean }>>;
    readonly flags: Readonly<Record<string, boolean>>;
  };
  readonly refresh: {
    readonly defaultProfile: string;
    readonly intervals: Readonly<Record<string, number>>;
  };
  readonly theme: {
    readonly defaultTheme: string;
    readonly darkTheme: string;
    readonly availableThemes: readonly string[];
    readonly allowUserOverride: boolean;
    readonly compactMode: string;
    readonly accentColor: string;
    readonly logo: string;
    readonly companyName: string;
    readonly applicationTitle: string;
  };
  readonly monitoring: {
    readonly defaultTimeWindowHours: number;
    readonly defaultStatusFilter: string;
    readonly defaultPageSize: number;
    readonly liveFeedChannels: Readonly<Record<string, string>>;
    readonly slowProcessingThresholdMs: number;
  };
  readonly clientLogging: {
    readonly shipLevel: string;
    readonly flushIntervalMs: number;
    readonly maxBufferEntries: number;
  };
}
