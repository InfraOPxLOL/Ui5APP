import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { OperationsQueryBuilder } from "../../operations/models/index.js";
import {
  formatDurationHuman,
  type HealthStatus,
  type Severity,
} from "../../operations/transform/index.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type {
  CertificateSummary,
  DashboardSummary,
  MessageSummary,
  NotificationSummary,
  QueueSummary,
  RuntimeSummary,
  StatisticsSummary,
} from "../../operations/dto/index.js";
import type { SearchResult } from "../../operations/dto/SearchDto.js";
import { logger } from "../../core/logging/logger.js";
import type {
  HealthWidgetDto,
  InterfaceSummaryDto,
  OperationsOverviewDto,
  OperationsSearchResponseDto,
  QuickInsightDto,
  TimelineEventDto,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const OVERVIEW_MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
/** How many messages the overview samples to derive interfaces, recoveries and the timeline. */
const SAMPLE_SIZE = 200;
/** How many recent failures the overview surfaces. */
const RECENT_FAILURE_LIMIT = 10;
/** How many interface cards the overview surfaces. */
const TOP_INTERFACES = 8;
/** How many events the timeline surfaces. */
const TIMELINE_LIMIT = 25;
/** Certificate expiry look-ahead horizon, in days. */
const CERT_HORIZON_DAYS = 30;
/** Default statistics window, in hours. */
const DEFAULT_WINDOW_HOURS = 24;

/**
 * Aggregation service for the Operations Workspace (Phase 8). It is the composition root that finally
 * wires the Phase-6 {@link OperationsEngine} to a route (the wiring Phase 6 deliberately deferred):
 * it builds a fresh, request-scoped engine per call (matching the engine's intended request-scoped
 * cache lifetime) and fans out across its message/runtime/queue/certificate/notification engines to
 * compose a single {@link OperationsOverviewDto}. No SDK, OData or CPI shape ever leaves this layer —
 * only Operations DTOs.
 */
export class OperationsService {
  /**
   * @param engineFactory builds a fresh, request-scoped {@link OperationsEngine} per call. Defaults
   * to the configuration-driven {@link createOperationsEngine}; injectable so tests can supply a
   * mock-backed engine independent of `connectivity.json`.
   */
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(OVERVIEW_MOCK_CONFIG),
  ) {}

  /**
   * Composes the Operations Overview.
   * @param windowHours statistics window in hours (defaults to 24).
   * @returns the composed overview.
   */
  public async getOverview(
    windowHours: number = DEFAULT_WINDOW_HOURS,
  ): Promise<OperationsOverviewDto> {
    const engine = this.engineFactory();
    const now = new Date();
    const from = new Date(now.getTime() - windowHours * 3_600_000).toISOString();
    const to = now.toISOString();

    const [
      dashboardResult,
      artifactsResult,
      queuesResult,
      expiringCertsResult,
      allCertsResult,
      failedResult,
      sampleResult,
    ] = await Promise.allSettled([
      engine.getDashboardSummary(from, to, RECENT_FAILURE_LIMIT),
      engine.runtime.listArtifacts(),
      engine.queue.listQueues(),
      engine.certificate.listExpiring(CERT_HORIZON_DAYS),
      engine.certificate.listCertificates(),
      engine.message.queryMessages(
        new OperationsQueryBuilder()
          .status("FAILED")
          .page(1)
          .pageSize(RECENT_FAILURE_LIMIT)
          .sortBy("startTime")
          .desc()
          .build(),
      ),
      engine.message.queryMessages(
        new OperationsQueryBuilder()
          .page(1)
          .pageSize(SAMPLE_SIZE)
          .sortBy("startTime")
          .desc()
          .build(),
      ),
    ]);

    // Every dimension below comes from an independent Integration Suite API. Some tenants/plans
    // don't implement all of them (e.g. JmsQueues can 501 as "Not Implemented" on trial tenants) —
    // one unavailable dimension must degrade to an honest empty/neutral value, never take down the
    // whole overview (previously a single Promise.all rejection 502'd the entire Dashboard).
    const dashboard = OperationsService.settle(
      dashboardResult,
      "dashboard",
      OperationsService.emptyDashboardSummary(from, to, now),
    );
    const artifacts = OperationsService.settle(artifactsResult, "runtime.listArtifacts", []);
    const queues = OperationsService.settle(queuesResult, "queue.listQueues", []);
    const expiringCerts = OperationsService.settle(
      expiringCertsResult,
      "certificate.listExpiring",
      [],
    );
    const allCerts = OperationsService.settle(allCertsResult, "certificate.listCertificates", []);
    const failed = OperationsService.settle(
      failedResult,
      "message.queryMessages(failed)",
      OperationsService.emptySearchResult<MessageSummary>(),
    );
    const sample = OperationsService.settle(
      sampleResult,
      "message.queryMessages(sample)",
      OperationsService.emptySearchResult<MessageSummary>(),
    );

    const topInterfaces = OperationsService.buildInterfaces(sample.items);
    const health = OperationsService.buildHealth(
      dashboard.runtimeHealthCounts,
      artifacts,
      queues,
      expiringCerts,
      allCerts.length,
      dashboard.recentNotifications,
    );
    const timeline = OperationsService.buildTimeline(
      failed.items,
      sample.items,
      dashboard.recentNotifications,
      artifacts,
      queues,
      expiringCerts,
    );
    const quickInsights = OperationsService.buildQuickInsights(
      dashboard.statistics,
      artifacts,
      expiringCerts,
    );

    return {
      generatedAt: dashboard.generatedAt,
      window: { from, to, hours: windowHours },
      health,
      statistics: dashboard.statistics,
      runtimeHealthCounts: dashboard.runtimeHealthCounts,
      topInterfaces,
      recentFailures: failed.items,
      recentNotifications: dashboard.recentNotifications,
      timeline,
      quickInsights,
    };
  }

  /**
   * Runs the workspace search across every operational domain the Operations Engine can search (§6).
   * @param term the raw search term.
   * @returns the aggregated matches.
   */
  public async search(term: string): Promise<OperationsSearchResponseDto> {
    const startedAt = Date.now();
    const trimmed = term.trim();
    if (trimmed === "") {
      return {
        query: trimmed,
        messages: [],
        queues: [],
        certificates: [],
        runtimeArtifacts: [],
        totalHits: 0,
        tookMs: Date.now() - startedAt,
      };
    }
    const engine = this.engineFactory();
    const needle = trimmed.toLowerCase();
    const [messagesSettled, queuesSettled, certificatesSettled, artifactsSettled] =
      await Promise.allSettled([
        engine.message.queryMessages(
          new OperationsQueryBuilder()
            .search(trimmed)
            .page(1)
            .pageSize(25)
            .sortBy("startTime")
            .desc()
            .build(),
        ),
        engine.queue.listQueues(),
        engine.certificate.search({ alias: trimmed }),
        engine.runtime.listArtifacts(),
      ]);
    // Same partial-failure resilience as getOverview(): one unavailable domain (e.g. queues on a
    // tenant that doesn't implement JmsQueues) must not zero out search results from every other domain.
    const messagesResult = OperationsService.settle(
      messagesSettled,
      "message.queryMessages(search)",
      OperationsService.emptySearchResult<MessageSummary>(),
    );
    const queues = OperationsService.settle(queuesSettled, "queue.listQueues", []);
    const certificates = OperationsService.settle(certificatesSettled, "certificate.search", []);
    const artifacts = OperationsService.settle(artifactsSettled, "runtime.listArtifacts", []);

    const matchedQueues = queues.filter(
      (queue) =>
        queue.queueName.toLowerCase().includes(needle) ||
        queue.displayName.toLowerCase().includes(needle),
    );
    const matchedArtifacts = artifacts.filter(
      (artifact) =>
        artifact.name.toLowerCase().includes(needle) ||
        artifact.status.toLowerCase().includes(needle),
    );

    return {
      query: trimmed,
      messages: messagesResult.items,
      queues: matchedQueues,
      certificates,
      runtimeArtifacts: matchedArtifacts,
      totalHits:
        messagesResult.items.length +
        matchedQueues.length +
        certificates.length +
        matchedArtifacts.length,
      tookMs: Date.now() - startedAt,
    };
  }

  // --- Interface aggregation ------------------------------------------------

  private static buildInterfaces(
    messages: readonly MessageSummary[],
  ): readonly InterfaceSummaryDto[] {
    const groups = new Map<string, MessageSummary[]>();
    for (const message of messages) {
      const bucket = groups.get(message.integrationFlow);
      if (bucket === undefined) {
        groups.set(message.integrationFlow, [message]);
      } else {
        bucket.push(message);
      }
    }
    const interfaces: InterfaceSummaryDto[] = [];
    for (const [name, group] of groups) {
      const failures = group.filter(
        (m) => m.severity === "error" || m.severity === "critical",
      ).length;
      const warnings = group.filter((m) => m.severity === "warning").length;
      const durations = group
        .map((m) => m.processingTimeMs)
        .filter((value): value is number => value !== undefined);
      const averageRuntimeMs =
        durations.length === 0
          ? undefined
          : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
      const lastExecution = group.map((m) => m.startTime).sort((a, b) => (a > b ? -1 : 1))[0];
      const health = OperationsService.interfaceHealth(failures, group.length);
      interfaces.push({
        name,
        statusText: OperationsService.healthLabel(health),
        health,
        lastExecution,
        averageRuntimeMs,
        averageRuntimeHuman: formatDurationHuman(averageRuntimeMs),
        messageCount: group.length,
        failures,
        warnings,
      });
    }
    return interfaces.sort((a, b) => b.messageCount - a.messageCount).slice(0, TOP_INTERFACES);
  }

  private static interfaceHealth(failures: number, total: number): HealthStatus {
    if (total === 0 || failures === 0) {
      return "healthy";
    }
    return failures / total >= 0.25 ? "critical" : "warning";
  }

  // --- Health widgets -------------------------------------------------------

  private static buildHealth(
    runtimeHealthCounts: Readonly<Record<HealthStatus, number>>,
    artifacts: readonly RuntimeSummary[],
    queues: readonly QueueSummary[],
    expiringCerts: readonly CertificateSummary[],
    totalCerts: number,
    notifications: readonly NotificationSummary[],
  ): readonly HealthWidgetDto[] {
    const runtimeTotal =
      runtimeHealthCounts.healthy + runtimeHealthCounts.warning + runtimeHealthCounts.critical;
    const runtime: HealthWidgetDto = {
      id: "runtime",
      titleKey: "ops.health.runtime",
      health: OperationsService.worst([
        runtimeHealthCounts.critical > 0 ? "critical" : "healthy",
        runtimeHealthCounts.warning > 0 ? "warning" : "healthy",
      ]),
      value: runtimeHealthCounts.critical,
      total: runtimeTotal,
      severity: "info",
      statusText: `${runtimeHealthCounts.critical} of ${runtimeTotal} artifacts erroring`,
      description: "Deployed integration runtime artifacts and their current state.",
      recommendedAction:
        runtimeHealthCounts.critical > 0 ? "Investigate erroring runtime artifacts." : "",
    };

    const pendingDeployments = artifacts.filter((a) => a.status.toUpperCase() !== "STARTED").length;
    const deployment: HealthWidgetDto = {
      id: "deployment",
      titleKey: "ops.health.deployment",
      health: pendingDeployments > 0 ? "warning" : "healthy",
      value: pendingDeployments,
      total: artifacts.length,
      severity: "info",
      statusText: `${pendingDeployments} artifacts not started`,
      description: "Artifacts that are deploying, stopped or failed to start.",
      recommendedAction: pendingDeployments > 0 ? "Review artifacts that are not started." : "",
    };

    const expired = expiringCerts.filter((c) => c.daysRemaining < 0).length;
    const certificate: HealthWidgetDto = {
      id: "certificate",
      titleKey: "ops.health.certificate",
      health: expired > 0 ? "critical" : expiringCerts.length > 0 ? "warning" : "healthy",
      value: expiringCerts.length,
      total: totalCerts,
      severity: "info",
      statusText: `${expiringCerts.length} expiring within ${CERT_HORIZON_DAYS} days`,
      description: "Keystore entries approaching or past their expiry.",
      recommendedAction:
        expired > 0
          ? "Renew expired certificates immediately."
          : expiringCerts.length > 0
            ? "Plan renewal for soon-to-expire certificates."
            : "",
    };

    const criticalQueues = queues.filter((q) => q.health === "critical").length;
    const warningQueues = queues.filter((q) => q.health === "warning").length;
    const queue: HealthWidgetDto = {
      id: "queue",
      titleKey: "ops.health.queue",
      health: criticalQueues > 0 ? "critical" : warningQueues > 0 ? "warning" : "healthy",
      value: criticalQueues + warningQueues,
      total: queues.length,
      severity: "info",
      statusText: `${criticalQueues} critical, ${warningQueues} warning`,
      description: "JMS queue depth and capacity utilization.",
      recommendedAction: criticalQueues > 0 ? "Drain or scale queues nearing capacity." : "",
    };

    const criticalAlerts = notifications.filter(
      (n) => n.severity === "critical" || n.severity === "error",
    ).length;
    const alert: HealthWidgetDto = {
      id: "alert",
      titleKey: "ops.health.alert",
      health: criticalAlerts > 0 ? "critical" : notifications.length > 0 ? "warning" : "healthy",
      value: criticalAlerts,
      total: notifications.length,
      severity: "info",
      statusText: `${criticalAlerts} critical of ${notifications.length} alerts`,
      description: "Active alerts raised for this tenant.",
      recommendedAction: criticalAlerts > 0 ? "Acknowledge and triage critical alerts." : "",
    };

    const dimensions = [runtime, deployment, certificate, queue, alert];
    const tenantHealth = OperationsService.worst(dimensions.map((d) => d.health));
    const unhealthy = dimensions.filter((d) => d.health !== "healthy").length;
    const tenant: HealthWidgetDto = {
      id: "tenant",
      titleKey: "ops.health.tenant",
      health: tenantHealth,
      value: unhealthy,
      total: dimensions.length,
      severity: "info",
      statusText:
        tenantHealth === "healthy"
          ? "All operational dimensions healthy"
          : `${unhealthy} of ${dimensions.length} dimensions need attention`,
      description: "Composite health across runtime, queues, certificates and alerts.",
      recommendedAction: tenantHealth === "healthy" ? "" : "Review the dimensions flagged below.",
    };

    return [tenant, runtime, deployment, queue, certificate, alert].map((widget) => ({
      ...widget,
      severity: OperationsService.healthSeverity(widget.health),
    }));
  }

  // --- Timeline -------------------------------------------------------------

  private static buildTimeline(
    failures: readonly MessageSummary[],
    sample: readonly MessageSummary[],
    notifications: readonly NotificationSummary[],
    artifacts: readonly RuntimeSummary[],
    queues: readonly QueueSummary[],
    expiringCerts: readonly CertificateSummary[],
  ): readonly TimelineEventDto[] {
    const events: TimelineEventDto[] = [];

    for (const failure of failures) {
      events.push({
        id: `failure:${failure.messageId}`,
        kind: "failure",
        title: `Failure in ${failure.integrationFlow}`,
        description: `${failure.sender} → ${failure.receiver} (${failure.humanReadableStatus})`,
        severity: failure.severity,
        timestamp: failure.startTime,
        source: failure.integrationFlow,
      });
    }

    for (const recovery of OperationsService.deriveRecoveries(sample)) {
      events.push(recovery);
    }

    for (const notification of notifications) {
      events.push({
        id: `alert:${notification.notificationId}`,
        kind: "alert",
        title: notification.title,
        description: notification.description,
        severity: notification.severity,
        timestamp: notification.raisedAt,
        source: notification.source,
      });
    }

    for (const artifact of artifacts) {
      if (artifact.deployedOn !== undefined) {
        events.push({
          id: `deployment:${artifact.artifactId}`,
          kind: "deployment",
          title: `Deployed ${artifact.name}`,
          description: `${artifact.type} — ${artifact.humanReadableStatus}`,
          severity: artifact.health === "critical" ? "error" : "info",
          timestamp: artifact.deployedOn,
          source: artifact.deployedBy ?? artifact.name,
        });
      }
      if (artifact.health === "critical") {
        events.push({
          id: `runtime:${artifact.artifactId}`,
          kind: "runtime",
          title: `${artifact.name} is erroring`,
          description: artifact.errorText ?? artifact.humanReadableStatus,
          severity: "error",
          timestamp: artifact.deployedOn ?? new Date().toISOString(),
          source: artifact.name,
        });
      }
    }

    for (const queue of queues) {
      if (queue.health !== "healthy") {
        events.push({
          id: `queue:${queue.queueName}`,
          kind: "queue",
          title: `Queue ${queue.displayName} at ${queue.utilization}%`,
          description: `${queue.messageCount} messages, ${queue.consumerCount} consumers`,
          severity: queue.health === "critical" ? "critical" : "warning",
          timestamp: new Date().toISOString(),
          source: queue.queueName,
        });
      }
    }

    for (const cert of expiringCerts) {
      events.push({
        id: `certificate:${cert.alias}`,
        kind: "certificate",
        title: `Certificate ${cert.alias}`,
        description:
          cert.daysRemaining < 0
            ? `Expired ${Math.abs(cert.daysRemaining)} days ago`
            : `Expires in ${cert.daysRemaining} days`,
        severity: cert.health === "critical" ? "critical" : "warning",
        timestamp: cert.validTo,
        source: cert.owner ?? cert.alias,
      });
    }

    return events
      .sort((a, b) => (a.timestamp > b.timestamp ? -1 : a.timestamp < b.timestamp ? 1 : 0))
      .slice(0, TIMELINE_LIMIT);
  }

  private static deriveRecoveries(sample: readonly MessageSummary[]): readonly TimelineEventDto[] {
    const byCorrelation = new Map<string, MessageSummary[]>();
    for (const message of sample) {
      const bucket = byCorrelation.get(message.correlationId);
      if (bucket === undefined) {
        byCorrelation.set(message.correlationId, [message]);
      } else {
        bucket.push(message);
      }
    }
    const recoveries: TimelineEventDto[] = [];
    for (const [correlationId, group] of byCorrelation) {
      const failed = group.some((m) => m.severity === "error" || m.severity === "critical");
      const completed = group
        .filter((m) => m.status.toUpperCase() === "COMPLETED")
        .sort((a, b) => (a.startTime > b.startTime ? -1 : 1))[0];
      if (failed && completed !== undefined) {
        recoveries.push({
          id: `recovery:${correlationId}`,
          kind: "recovery",
          title: `Recovered ${completed.integrationFlow}`,
          description: `${completed.sender} → ${completed.receiver}`,
          severity: "info",
          timestamp: completed.startTime,
          source: completed.integrationFlow,
        });
      }
    }
    return recoveries;
  }

  // --- Quick insights -------------------------------------------------------

  private static buildQuickInsights(
    statistics: OperationsOverviewDto["statistics"],
    artifacts: readonly RuntimeSummary[],
    expiringCerts: readonly CertificateSummary[],
  ): readonly QuickInsightDto[] {
    const failureRate =
      statistics.totalMessages === 0
        ? 0
        : Math.round((statistics.failedCount / statistics.totalMessages) * 1000) / 10;
    const erroring = artifacts.filter((a) => a.health === "critical").length;
    return [
      {
        id: "failureRate",
        labelKey: "ops.insight.failureRate",
        value: `${failureRate}%`,
        severity: failureRate >= 10 ? "critical" : failureRate > 0 ? "warning" : "info",
        hint: `${statistics.failedCount} of ${statistics.totalMessages} messages failed`,
      },
      {
        id: "avgProcessing",
        labelKey: "ops.insight.avgProcessing",
        value: formatDurationHuman(statistics.averageProcessingTimeMs),
        severity: "info",
        hint: "Average processing time across the window",
      },
      {
        id: "erroringArtifacts",
        labelKey: "ops.insight.erroringArtifacts",
        value: String(erroring),
        severity: erroring > 0 ? "critical" : "info",
        hint: `${erroring} of ${artifacts.length} artifacts erroring`,
      },
      {
        id: "expiringCerts",
        labelKey: "ops.insight.expiringCerts",
        value: String(expiringCerts.length),
        severity: expiringCerts.length > 0 ? "warning" : "info",
        hint: `Certificates expiring within ${CERT_HORIZON_DAYS} days`,
      },
    ];
  }

  // --- Health helpers -------------------------------------------------------

  private static worst(healths: readonly HealthStatus[]): HealthStatus {
    if (healths.includes("critical")) {
      return "critical";
    }
    if (healths.includes("warning")) {
      return "warning";
    }
    return "healthy";
  }

  private static healthSeverity(health: HealthStatus): Severity {
    return health === "critical" ? "critical" : health === "warning" ? "warning" : "info";
  }

  private static healthLabel(health: HealthStatus): string {
    return health === "critical" ? "Critical" : health === "warning" ? "Warning" : "Healthy";
  }

  // --- Partial-failure resilience --------------------------------------------

  /**
   * Unwraps one {@link Promise.allSettled} result, logging a warning and substituting an honest
   * empty/neutral fallback when that one domain's Integration Suite call failed — so an outage or
   * unimplemented API in a single domain degrades only its own widget instead of the whole response.
   */
  private static settle<T>(result: PromiseSettledResult<T>, domain: string, fallback: T): T {
    if (result.status === "fulfilled") {
      return result.value;
    }
    const reason = result.reason;
    logger.warn(
      { domain, err: reason instanceof Error ? reason.message : String(reason) },
      "operations.overview.domain.degraded",
    );
    return fallback;
  }

  private static emptySearchResult<T>(): SearchResult<T> {
    return { items: [], total: 0, tookMs: 0 };
  }

  private static emptyDashboardSummary(
    windowFrom: string,
    windowTo: string,
    now: Date,
  ): DashboardSummary {
    return {
      statistics: OperationsService.emptyStatistics(windowFrom, windowTo),
      runtimeHealthCounts: { healthy: 0, warning: 0, critical: 0 },
      recentNotifications: [],
      generatedAt: now.toISOString(),
    };
  }

  private static emptyStatistics(windowFrom: string, windowTo: string): StatisticsSummary {
    return {
      windowFrom,
      windowTo,
      totalMessages: 0,
      failedCount: 0,
      completedCount: 0,
      processingCount: 0,
      cancelledCount: 0,
      averageProcessingTimeMs: undefined,
      maxProcessingTimeMs: undefined,
      minProcessingTimeMs: undefined,
      topSenders: [],
      topReceivers: [],
      topApplications: [],
      topMessageTypes: [],
      statusDistribution: [],
      runtimeStatusDistribution: [],
    };
  }
}

/** Shared service instance. */
export const operationsService = new OperationsService();
