import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, join } from "node:path";
import type { z } from "zod";
import { env } from "./env.js";
import { ConfigurationError } from "../core/errors/ConfigurationError.js";
import {
  applicationSchema,
  environmentSchema,
  tenantsSchema,
  queuesSchema,
  frameworksSchema,
  refreshSchema,
  featuresSchema,
  themeSchema,
  monitoringSchema,
  loggingSchema,
  securitySchema,
  connectivitySchema,
  type ApplicationConfig,
  type EnvironmentConfig,
  type TenantConfig,
  type QueueConfig,
  type FrameworkConfig,
  type RefreshProfile,
  type FeaturesConfig,
  type ThemeConfig,
  type MonitoringConfig,
  type LoggingConfig,
  type SecurityConfig,
  type ConnectivityConfig,
} from "./schemas/index.js";

/**
 * The composed, fully-validated configuration set — one property per file in `config/`.
 */
export interface AppConfig {
  readonly application: ApplicationConfig;
  readonly environment: EnvironmentConfig;
  readonly tenants: readonly TenantConfig[];
  readonly queues: readonly QueueConfig[];
  readonly frameworks: readonly FrameworkConfig[];
  readonly refresh: { defaultProfile: string; profiles: Record<string, RefreshProfile> };
  readonly features: FeaturesConfig;
  readonly theme: ThemeConfig;
  readonly monitoring: MonitoringConfig;
  readonly logging: LoggingConfig;
  readonly security: SecurityConfig;
  readonly connectivity: ConnectivityConfig;
}

/**
 * The singleton configuration service — the only place in the backend that reads configuration
 * files. Every configurable value in the application flows through this class; no other class may
 * read JSON from disk (architecture §11, reaffirmed by the Phase-3 platform mandate).
 *
 * Behaviour:
 * - Loads the eleven domain files from the `config/` directory once, at first access.
 * - Each `<name>.json` may be overlaid by a gitignored `<name>.local.json` (shallow merge) for
 *   local development.
 * - Every file is validated against its zod schema; any missing file or validation failure throws
 *   a {@link ConfigurationError} naming the offending file, so the process fails fast at boot and
 *   never starts with invalid configuration.
 * - The composed result is deep-frozen: configuration is immutable for the process lifetime,
 *   consistent with the stateless-backend model.
 *
 * The `config/` directory is located by walking upward from the working directory (so starting
 * from the repo root or the `srv/` workspace both work); `CONFIG_DIR` overrides with an absolute
 * path.
 */
export class ConfigService {
  private static instance: ConfigService | undefined;

  private readonly config: AppConfig;

  private constructor() {
    const dir = ConfigService.resolveConfigDir(env.configDir);
    this.config = ConfigService.deepFreeze({
      application: ConfigService.loadFile(dir, "application", applicationSchema),
      environment: ConfigService.loadFile(dir, "environment", environmentSchema),
      tenants: ConfigService.loadFile(dir, "tenants", tenantsSchema).tenants,
      queues: ConfigService.loadFile(dir, "queues", queuesSchema).queues,
      frameworks: ConfigService.loadFile(dir, "frameworks", frameworksSchema).frameworks,
      refresh: ConfigService.loadFile(dir, "refresh", refreshSchema),
      features: ConfigService.loadFile(dir, "features", featuresSchema),
      theme: ConfigService.loadFile(dir, "theme", themeSchema),
      monitoring: ConfigService.loadFile(dir, "monitoring", monitoringSchema),
      logging: ConfigService.loadFile(dir, "logging", loggingSchema),
      security: ConfigService.loadFile(dir, "security", securitySchema),
      connectivity: ConfigService.loadFile(dir, "connectivity", connectivitySchema),
    });
  }

  /**
   * @returns the process-wide singleton, loading and validating all configuration on first call.
   * @throws {ConfigurationError} when any configuration file is missing or invalid.
   */
  public static getInstance(): ConfigService {
    ConfigService.instance ??= new ConfigService();
    return ConfigService.instance;
  }

  /** @returns the application identity metadata (`application.json`). */
  public getApplication(): ApplicationConfig {
    return this.config.application;
  }

  /** @returns the deployment environment descriptor (`environment.json`). */
  public getEnvironment(): EnvironmentConfig {
    return this.config.environment;
  }

  /** @returns all configured tenants, including disabled ones (`tenants.json`). */
  public getTenants(): readonly TenantConfig[] {
    return this.config.tenants;
  }

  /**
   * Resolves a tenant by id, or the default enabled tenant when no id is given.
   * @param tenantId optional tenant id.
   * @returns the matching tenant.
   * @throws {ConfigurationError} when the id is unknown, or the tenant is disabled.
   */
  public getTenant(tenantId?: string): TenantConfig {
    const tenant =
      tenantId !== undefined
        ? this.config.tenants.find((t) => t.id === tenantId)
        : (this.config.tenants.find((t) => t.default && t.enabled) ??
          this.config.tenants.find((t) => t.enabled));
    if (tenant === undefined) {
      throw new ConfigurationError(
        `No tenant configuration found for id "${tenantId ?? "(default)"}"`,
      );
    }
    if (!tenant.enabled) {
      throw new ConfigurationError(`Tenant "${tenant.id}" is disabled`);
    }
    return tenant;
  }

  /** @returns all configured queues, including disabled ones (`queues.json`). */
  public getQueues(): readonly QueueConfig[] {
    return this.config.queues;
  }

  /**
   * @returns every configured processing framework, including disabled ones and in declaration
   *   order (`frameworks.json`). Detection callers should filter to `enabled` and sort by
   *   `priority` — see {@link getEnabledFrameworks}.
   */
  public getFrameworks(): readonly FrameworkConfig[] {
    return this.config.frameworks;
  }

  /**
   * @returns the enabled processing frameworks, ordered by ascending `priority` — the exact order
   *   framework detection evaluates rules in. Duplicate priorities are rejected at boot, so this
   *   ordering is total and deterministic.
   */
  public getEnabledFrameworks(): readonly FrameworkConfig[] {
    return this.config.frameworks
      .filter((framework) => framework.enabled)
      .slice()
      .sort((left, right) => left.priority - right.priority);
  }

  /**
   * Resolves a refresh profile's interval map.
   * @param profileName profile to resolve; the configured `defaultProfile` when omitted.
   * @returns the interval map (key → milliseconds).
   * @throws {ConfigurationError} when the profile name is unknown.
   */
  public getRefreshIntervals(profileName?: string): RefreshProfile {
    const name = profileName ?? this.config.refresh.defaultProfile;
    const profile = this.config.refresh.profiles[name];
    if (profile === undefined) {
      throw new ConfigurationError(`Unknown refresh profile "${name}"`);
    }
    return profile;
  }

  /** @returns the name of the default refresh profile. */
  public getDefaultRefreshProfileName(): string {
    return this.config.refresh.defaultProfile;
  }

  /** @returns module toggles and feature flags (`features.json`). */
  public getFeatures(): FeaturesConfig {
    return this.config.features;
  }

  /**
   * @param flag a feature-flag name from `features.json` → `flags`.
   * @returns whether the flag is enabled; unknown flags are `false`.
   */
  public isFeatureEnabled(flag: string): boolean {
    return this.config.features.flags[flag] === true;
  }

  /**
   * @param moduleId a module id from `features.json` → `modules`.
   * @returns whether the module is enabled; unknown modules are `false`.
   */
  public isModuleEnabled(moduleId: string): boolean {
    return this.config.features.modules[moduleId]?.enabled === true;
  }

  /** @returns the theming and branding configuration (`theme.json`). */
  public getTheme(): ThemeConfig {
    return this.config.theme;
  }

  /** @returns the cross-module monitoring defaults (`monitoring.json`). */
  public getMonitoring(): MonitoringConfig {
    return this.config.monitoring;
  }

  /** @returns the logging framework configuration (`logging.json`). */
  public getLogging(): LoggingConfig {
    return this.config.logging;
  }

  /** @returns the transport-security configuration (`security.json`). */
  public getSecurity(): SecurityConfig {
    return this.config.security;
  }

  /** @returns the Integration Suite SDK connectivity mode configuration (`connectivity.json`). */
  public getConnectivity(): ConnectivityConfig {
    return this.config.connectivity;
  }

  /** @returns the full composed configuration (diagnostics / projection building). */
  public getAll(): AppConfig {
    return this.config;
  }

  // ---------------------------------------------------------------------------------------------

  private static resolveConfigDir(configured: string): string {
    if (isAbsolute(configured)) {
      if (!existsSync(join(configured, "application.json"))) {
        throw new ConfigurationError(
          `CONFIG_DIR "${configured}" does not contain an application.json`,
        );
      }
      return configured;
    }
    let dir = process.cwd();
    for (;;) {
      const candidate = resolve(dir, configured);
      if (existsSync(join(candidate, "application.json"))) {
        return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        throw new ConfigurationError(
          `Could not locate a "${configured}/" directory (containing application.json) from ` +
            `${process.cwd()} or any parent directory. Set CONFIG_DIR to an absolute path.`,
        );
      }
      dir = parent;
    }
  }

  private static loadFile<S extends z.ZodTypeAny>(
    dir: string,
    name: string,
    schema: S,
  ): z.output<S> {
    const filePath = join(dir, `${name}.json`);
    const base = ConfigService.readJson(filePath, /* required */ true) as Record<string, unknown>;
    const localPath = join(dir, `${name}.local.json`);
    const local = existsSync(localPath)
      ? (ConfigService.readJson(localPath, false) as Record<string, unknown>)
      : undefined;
    const merged = local !== undefined ? { ...base, ...local } : base;

    const result = schema.safeParse(merged);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new ConfigurationError(`Invalid configuration in ${name}.json: ${issues}`);
    }
    return result.data;
  }

  private static readJson(path: string, required: boolean): unknown {
    if (!existsSync(path)) {
      if (required) {
        throw new ConfigurationError(`Required configuration file is missing: ${path}`);
      }
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (cause) {
      throw new ConfigurationError(
        `Configuration file is not valid JSON: ${path}`,
        undefined,
        cause,
      );
    }
  }

  private static deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
      for (const key of Object.getOwnPropertyNames(value)) {
        ConfigService.deepFreeze((value as Record<string, unknown>)[key]);
      }
      Object.freeze(value);
    }
    return value;
  }
}

/** The shared singleton instance used throughout the backend. */
export const configService: ConfigService = ConfigService.getInstance();
