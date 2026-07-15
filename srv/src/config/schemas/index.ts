/**
 * Barrel for the per-domain configuration schemas. Each module pairs a zod schema (the runtime
 * validator) with its inferred TypeScript type (the compile-time contract), so the JSON files in
 * `config/` are strongly typed end to end. The zod schemas are the single source of truth for
 * what valid configuration looks like.
 *
 * (Backend-only barrel: the frontend toolchain's re-export limitation — convention 4d in
 * docs/SCAFFOLD_PROGRESS.md — does not apply to the NodeNext backend.)
 */
export { applicationSchema, type ApplicationConfig } from "./application.schema.js";
export {
  environmentSchema,
  ENVIRONMENT_KINDS,
  type EnvironmentConfig,
  type EnvironmentKind,
} from "./environment.schema.js";
export {
  tenantsSchema,
  tenantSchema,
  type TenantConfig,
  type TenantsConfig,
} from "./tenants.schema.js";
export {
  queuesSchema,
  queueSchema,
  RETRY_STRATEGIES,
  type QueueConfig,
  type QueuesConfig,
  type RetryStrategy,
} from "./queues.schema.js";
export {
  refreshSchema,
  refreshProfileSchema,
  type RefreshConfig,
  type RefreshProfile,
} from "./refresh.schema.js";
export {
  featuresSchema,
  moduleToggleSchema,
  type FeaturesConfig,
  type ModuleToggle,
} from "./features.schema.js";
export { themeSchema, COMPACT_MODES, type ThemeConfig, type CompactMode } from "./theme.schema.js";
export { monitoringSchema, type MonitoringConfig } from "./monitoring.schema.js";
export {
  loggingSchema,
  LOG_LEVELS,
  type LoggingConfig,
  type ConfiguredLogLevel,
} from "./logging.schema.js";
export { securitySchema, type SecurityConfig } from "./security.schema.js";
export {
  connectivitySchema,
  tenantAuthSchema,
  CONNECTIVITY_MODES,
  DESTINATION_DISCOVERY_MODES,
  TENANT_AUTH_TYPES,
  type ConnectivityConfig,
  type ConnectivityMode,
  type DestinationDiscoveryMode,
  type TenantAuthConfig,
  type TenantAuthType,
} from "./connectivity.schema.js";
