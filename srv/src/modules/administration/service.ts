import type { AdministrationDto, ClientConfigDto } from "./dto.js";
import type { PagedResult } from "../../core/http/pagination.js";
import { configService } from "../../config/ConfigService.js";

/**
 * Service for the Administration module. Lists the configured destinations (from `tenants.json`,
 * never secrets) and exposes the client-facing configuration projection consumed by the frontend
 * bootstrap. All configuration flows through the {@link configService} — this service never reads
 * files itself.
 */
export class AdministrationService {
  /**
   * Lists the configured destinations and their reachability status.
   * @returns a page of destination rows (status is UNKNOWN until connectivity checks are wired).
   */
  public async list(): Promise<PagedResult<AdministrationDto>> {
    const items: AdministrationDto[] = configService.getTenants().map((tenant) => ({
      destinationName: tenant.destinationName,
      tenantLabel: tenant.name,
      status: "UNKNOWN",
      baseUrl: tenant.baseUrl,
    }));
    return { items, total: items.length, skip: 0, top: items.length };
  }

  /**
   * Builds the client-facing configuration projection (no secrets, no server-only knobs).
   * @returns the client configuration.
   */
  public getClientConfig(): ClientConfigDto {
    const application = configService.getApplication();
    const environment = configService.getEnvironment();
    const theme = configService.getTheme();
    const monitoring = configService.getMonitoring();
    const logging = configService.getLogging();
    const features = configService.getFeatures();

    return {
      application: {
        id: application.id,
        name: application.name,
        version: application.version,
        vendor: application.vendor,
        supportContact: application.supportContact,
        documentationUrl: application.documentationUrl,
      },
      environment: {
        name: environment.name,
        label: environment.label,
        kind: environment.kind,
      },
      tenants: configService.getTenants().map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        description: tenant.description,
        region: tenant.region,
        environment: tenant.environment,
        enabled: tenant.enabled,
        displayColor: tenant.displayColor,
        displayIcon: tenant.displayIcon,
        refreshProfile: tenant.refreshProfile,
        default: tenant.default,
      })),
      queues: configService.getQueues().map((queue) => ({
        name: queue.name,
        displayName: queue.displayName,
        description: queue.description,
        deadLetterQueue: queue.deadLetterQueue,
        retryQueue: queue.retryQueue,
        priority: queue.priority,
        enabled: queue.enabled,
        retryStrategy: queue.retryStrategy,
        maxRetries: queue.maxRetries,
      })),
      features: {
        modules: features.modules,
        flags: features.flags,
      },
      refresh: {
        defaultProfile: configService.getDefaultRefreshProfileName(),
        intervals: configService.getRefreshIntervals(),
      },
      theme: {
        defaultTheme: theme.defaultTheme,
        darkTheme: theme.darkTheme,
        availableThemes: theme.availableThemes,
        allowUserOverride: theme.allowUserOverride,
        compactMode: theme.compactMode,
        accentColor: theme.accentColor,
        logo: theme.logo,
        companyName: theme.companyName,
        applicationTitle: theme.applicationTitle,
      },
      monitoring: {
        defaultTimeWindowHours: monitoring.defaultTimeWindowHours,
        defaultStatusFilter: monitoring.defaultStatusFilter,
        defaultPageSize: monitoring.defaultPageSize,
        liveFeedChannels: monitoring.liveFeedChannels,
        slowProcessingThresholdMs: monitoring.slowProcessingThresholdMs,
      },
      clientLogging: {
        shipLevel: logging.client.shipLevel,
        flushIntervalMs: logging.client.flushIntervalMs,
        maxBufferEntries: logging.client.maxBufferEntries,
      },
    };
  }
}

/** Shared service instance. */
export const administrationService = new AdministrationService();
