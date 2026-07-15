import type { ModuleId } from "./Module";

/**
 * Client-side view of the runtime configuration served by the backend
 * (`GET /api/v1/administration/config`). This mirrors the backend's `ClientConfigDto` — a safe
 * projection of the `config/` domain files (`application.json`, `environment.json`,
 * `tenants.json`, `queues.json`, `features.json`, `refresh.json`, `theme.json`,
 * `monitoring.json`, plus the client-relevant subset of `logging.json`). Server-only knobs
 * (destinations, security, backend logging) are never exposed here.
 */
export interface AppConfig {
  readonly application: ApplicationInfo;
  readonly environment: EnvironmentConfig;
  readonly tenants: readonly TenantConfig[];
  readonly queues: readonly QueueConfig[];
  readonly features: FeaturesConfig;
  readonly refresh: RefreshConfig;
  readonly theme: ThemeConfig;
  readonly monitoring: MonitoringDefaults;
  readonly clientLogging: ClientLoggingConfig;
}

/** Application identity metadata (from `application.json`). */
export interface ApplicationInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly vendor: string;
  readonly supportContact: string;
  readonly documentationUrl: string;
}

/** Deployment environment descriptor (from `environment.json`). */
export interface EnvironmentConfig {
  readonly name: string;
  readonly label: string;
  /** Behavioural kind: `development`, `testing`, or `production` (extensible server-side). */
  readonly kind: string;
}

/** One configured Integration Suite tenant (client projection; no destination name). */
export interface TenantConfig {
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

/** One configured JMS queue (client projection). */
export interface QueueConfig {
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

/** Module enablement plus free-form feature flags (from `features.json`). */
export interface FeaturesConfig {
  readonly modules: Readonly<Record<ModuleId, ModuleToggle>>;
  readonly flags: Readonly<Record<string, boolean>>;
}

/** A single module's toggle. */
export interface ModuleToggle {
  readonly enabled: boolean;
}

/** Resolved refresh cadence (the default profile's intervals, from `refresh.json`). */
export interface RefreshConfig {
  readonly defaultProfile: string;
  readonly intervals: Readonly<Record<string, number>>;
}

/** Theming and branding (from `theme.json`). */
export interface ThemeConfig {
  readonly defaultTheme: string;
  readonly darkTheme: string;
  readonly availableThemes: readonly string[];
  readonly allowUserOverride: boolean;
  readonly compactMode: string;
  readonly accentColor: string;
  readonly logo: string;
  readonly companyName: string;
  readonly applicationTitle: string;
}

/** Cross-module monitoring defaults (from `monitoring.json`). */
export interface MonitoringDefaults {
  readonly defaultTimeWindowHours: number;
  readonly defaultStatusFilter: string;
  readonly defaultPageSize: number;
  readonly liveFeedChannels: Readonly<Record<string, string>>;
  readonly slowProcessingThresholdMs: number;
}

/** Client-logging knobs (the browser-relevant subset of `logging.json`). */
export interface ClientLoggingConfig {
  readonly shipLevel: string;
  readonly flushIntervalMs: number;
  readonly maxBufferEntries: number;
}
