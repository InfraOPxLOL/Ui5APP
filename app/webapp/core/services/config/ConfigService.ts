import ApiClient from "../http/ApiClient";
import type {
  AppConfig,
  ApplicationInfo,
  EnvironmentConfig,
  TenantConfig,
  QueueConfig,
  FeaturesConfig,
  ThemeConfig,
  MonitoringDefaults,
  ClientLoggingConfig,
} from "../../types/AppConfig";
import type { ModuleId } from "../../types/Module";

/**
 * The client-side configuration service — the frontend's single source of configuration truth.
 *
 * Mirrors the backend `ConfigService`: the browser cannot read the `config/` files, so this
 * service fetches the safe projection the backend assembles (`GET /api/v1/administration/config`)
 * once during bootstrap, then serves it synchronously through typed getters. No other frontend
 * class fetches or caches configuration; module enablement, feature flags, refresh intervals,
 * theming, tenants and monitoring defaults all resolve through here.
 *
 * Lifecycle: {@link ConfigService.load} must be awaited during component bootstrap before any
 * getter is used; getters throw if called earlier so a wiring mistake fails loudly, not subtly.
 */
export default class ConfigService {
  private static instance: ConfigService | undefined;
  private config: AppConfig | undefined;

  private constructor(private readonly client: ApiClient = ApiClient.getInstance()) {}

  /**
   * @returns the process-wide singleton config service.
   */
  public static getInstance(): ConfigService {
    ConfigService.instance ??= new ConfigService();
    return ConfigService.instance;
  }

  /**
   * Fetches and caches the runtime configuration. Awaited during bootstrap before the shell
   * renders navigation.
   * @returns the loaded configuration.
   */
  public async load(): Promise<AppConfig> {
    this.config ??= await this.client.get<AppConfig>("/administration/config");
    return this.config;
  }

  /**
   * @returns the cached configuration.
   * @throws {Error} if called before {@link ConfigService.load} has resolved.
   */
  public getConfig(): AppConfig {
    if (this.config === undefined) {
      throw new Error("ConfigService.load() must complete before configuration is read.");
    }
    return this.config;
  }

  /** @returns the application identity metadata. */
  public getApplication(): ApplicationInfo {
    return this.getConfig().application;
  }

  /** @returns the deployment environment descriptor. */
  public getEnvironment(): EnvironmentConfig {
    return this.getConfig().environment;
  }

  /** @returns all configured tenants (including disabled ones, for admin surfaces). */
  public getTenants(): readonly TenantConfig[] {
    return this.getConfig().tenants;
  }

  /**
   * @returns the default enabled tenant.
   * @throws {Error} when no enabled tenant exists (misconfiguration — caught server-side at boot).
   */
  public getDefaultTenant(): TenantConfig {
    const tenants = this.getConfig().tenants;
    const tenant = tenants.find((t) => t.default && t.enabled) ?? tenants.find((t) => t.enabled);
    if (tenant === undefined) {
      throw new Error("No enabled tenant is configured.");
    }
    return tenant;
  }

  /** @returns all configured queues (client projection). */
  public getQueues(): readonly QueueConfig[] {
    return this.getConfig().queues;
  }

  /** @returns module toggles and feature flags. */
  public getFeatures(): FeaturesConfig {
    return this.getConfig().features;
  }

  /**
   * @param moduleId the module to check.
   * @returns whether the module is enabled for this deployment.
   */
  public isModuleEnabled(moduleId: ModuleId): boolean {
    return this.getConfig().features.modules[moduleId]?.enabled === true;
  }

  /**
   * @param flag the feature flag name.
   * @returns whether the flag is enabled (defaults to `false` when undefined).
   */
  public isFeatureEnabled(flag: string): boolean {
    return this.getConfig().features.flags[flag] === true;
  }

  /**
   * @param key the refresh-interval key (e.g. `dashboardMs`).
   * @param fallbackMs value returned when the key is not configured.
   * @returns the configured interval in milliseconds, or the fallback.
   */
  public getRefreshInterval(key: string, fallbackMs: number): number {
    return this.getConfig().refresh.intervals[key] ?? fallbackMs;
  }

  /** @returns the full resolved refresh interval map. */
  public getRefreshIntervals(): Readonly<Record<string, number>> {
    return this.getConfig().refresh.intervals;
  }

  /** @returns the theming and branding configuration. */
  public getTheme(): ThemeConfig {
    return this.getConfig().theme;
  }

  /** @returns the cross-module monitoring defaults. */
  public getMonitoring(): MonitoringDefaults {
    return this.getConfig().monitoring;
  }

  /** @returns the client-logging configuration. */
  public getClientLogging(): ClientLoggingConfig {
    return this.getConfig().clientLogging;
  }
}
