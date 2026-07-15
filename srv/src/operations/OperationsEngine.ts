import type { IntegrationSuiteSdkClient } from "../sdk/client/index.js";
import type { QueueConfig } from "../config/schemas/index.js";
import type { QueueDiscoveryMode } from "../config/env.js";
import { OperationsCache } from "./cache/index.js";
import {
  MessageEngine,
  RuntimeEngine,
  PayloadEngine,
  HeaderEngine,
  AttachmentEngine,
  QueueEngine,
  RecoveryEngine,
  CertificateEngine,
  StatisticsEngine,
  SearchEngine,
  FilterEngine,
  ExportEngine,
  RefreshEngine,
  NotificationEngine,
  RuntimeCenterEngine,
  CertificateSecurityEngine,
  PartnerDirectoryEngine,
} from "./engines/index.js";
import type { DashboardSummary } from "./dto/DashboardDto.js";
import type { HealthStatus } from "./transform/index.js";

/** Configuration for {@link OperationsEngine}. */
export interface OperationsEngineOptions {
  /** The Integration Suite SDK client every engine is built on (mock- or real-provider-backed — the Operations Engine doesn't know or care which). */
  readonly sdk: IntegrationSuiteSdkClient;
  /** Static queue topology metadata (`ConfigService.getQueues()`), for `QueueEngine`. Defaults to none. */
  readonly queueConfigs?: readonly QueueConfig[];
  /** Queue discovery mode (`env.jmsQueueDiscoveryMode`), for `QueueEngine`. Defaults to `"Fetch_Specific"`. */
  readonly queueDiscoveryMode?: QueueDiscoveryMode;
}

/**
 * The Operations Engine — the **only** business layer in the application (architecture: Phase 6).
 *
 * ```
 * UI → Operations Engine → Integration Suite SDK → Integration Suite
 * ```
 *
 * Every future UI module communicates *only* with this class (or the engines it exposes); nothing
 * above it may import `sdk/*` directly. It aggregates, transforms, enriches and normalizes SDK
 * responses into the Operations DTO layer (`operations/dto`) — no SDK/core domain type, no OData
 * shape, no upstream endpoint name, no authentication detail ever crosses this boundary.
 *
 * Composes one instance of every Phase-6 engine, all sharing one request-scoped
 * {@link OperationsCache} (architecture: Caching, §17 — construct one `OperationsEngine` per inbound
 * request/operation, exactly as you would construct one `IntegrationSuiteSdkClient`, so the cache's
 * lifetime matches "this operation", never longer). `filter`/`export` are stateless utility engines
 * exposed as their class (not an instance) — `engine.filter.forMessages()...`,
 * `engine.export.toCsv(...)` — since neither carries per-instance state.
 */
export class OperationsEngine {
  public readonly message: MessageEngine;
  public readonly runtime: RuntimeEngine;
  public readonly payload: PayloadEngine;
  public readonly header: HeaderEngine;
  public readonly attachment: AttachmentEngine;
  public readonly queue: QueueEngine;
  public readonly recovery: RecoveryEngine;
  public readonly certificate: CertificateEngine;
  public readonly statistics: StatisticsEngine;
  public readonly search: SearchEngine;
  public readonly filter: typeof FilterEngine;
  public readonly export: typeof ExportEngine;
  public readonly refresh: RefreshEngine;
  public readonly notification: NotificationEngine;
  public readonly runtimeCenter: RuntimeCenterEngine;
  public readonly certificateSecurity: CertificateSecurityEngine;
  /** Partner Directory read/write access — the CoE Framework's configuration store. */
  public readonly partnerDirectory: PartnerDirectoryEngine;

  public constructor(options: OperationsEngineOptions) {
    const cache = new OperationsCache();
    const sdk = options.sdk;

    this.message = new MessageEngine(sdk.monitoring, cache);
    this.runtime = new RuntimeEngine(sdk.runtime, cache);
    this.payload = new PayloadEngine(sdk.payload, sdk.splunk, cache);
    this.header = new HeaderEngine();
    this.attachment = new AttachmentEngine(sdk.payload, cache);
    this.queue = new QueueEngine(
      sdk.jms,
      options.queueConfigs ?? [],
      cache,
      options.queueDiscoveryMode,
    );
    this.recovery = new RecoveryEngine(
      this.queue,
      sdk.jms,
      this.runtime,
      options.queueConfigs ?? [],
      cache,
    );
    this.certificate = new CertificateEngine(sdk.certificate, cache);
    this.statistics = new StatisticsEngine(sdk.monitoring, this.runtime, cache);
    this.search = new SearchEngine(this.message, this.queue, this.certificate);
    this.filter = FilterEngine;
    this.export = ExportEngine;
    this.refresh = new RefreshEngine();
    this.notification = new NotificationEngine(sdk.alertNotification, cache);
    this.runtimeCenter = new RuntimeCenterEngine(
      this.runtime,
      this.message,
      this.queue,
      this.certificate,
      this.notification,
      cache,
    );
    this.certificateSecurity = new CertificateSecurityEngine(this.certificate, cache);
    this.partnerDirectory = new PartnerDirectoryEngine(sdk.partnerDirectory, cache);
  }

  /**
   * Composes the single aggregated view a future Dashboard screen consumes (architecture: Phase 6,
   * DTO Layer, §14 — `DashboardSummary`; no Dashboard UI is built in this phase).
   * @param windowFromIso statistics window start (ISO 8601).
   * @param windowToIso statistics window end (ISO 8601).
   * @param recentNotificationsLimit how many recent notifications to include (default 10).
   * @returns the composed dashboard summary.
   */
  public async getDashboardSummary(
    windowFromIso: string,
    windowToIso: string,
    recentNotificationsLimit = 10,
  ): Promise<DashboardSummary> {
    const [statistics, artifacts, notifications] = await Promise.all([
      this.statistics.getStatistics(windowFromIso, windowToIso),
      this.runtime.listArtifacts(),
      this.notification.listNotifications({ skip: 0, top: recentNotificationsLimit }),
    ]);

    const runtimeHealthCounts: Record<HealthStatus, number> = {
      healthy: 0,
      warning: 0,
      critical: 0,
    };
    for (const artifact of artifacts) {
      runtimeHealthCounts[artifact.health] += 1;
    }

    return {
      statistics,
      runtimeHealthCounts,
      recentNotifications: notifications.items,
      generatedAt: new Date().toISOString(),
    };
  }
}
