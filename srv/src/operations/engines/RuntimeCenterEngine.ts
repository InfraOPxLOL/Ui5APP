import type { RuntimeEngine } from "./RuntimeEngine.js";
import type { MessageEngine } from "./MessageEngine.js";
import type { QueueEngine } from "./QueueEngine.js";
import type { CertificateEngine } from "./CertificateEngine.js";
import type { NotificationEngine } from "./NotificationEngine.js";
import type { RuntimeSummary } from "../dto/RuntimeDto.js";
import type {
  CatalogEntry,
  DeploymentEvent,
  IntegrationDetails,
  RuntimeHealthSummary,
} from "../dto/RuntimeCenterDto.js";
import type { HealthStatus } from "../transform/index.js";
import { OperationsCache } from "../cache/index.js";
import { OperationsQueryBuilder } from "../models/index.js";
import { runtimeCenterStateStore, RuntimeCenterStateStore } from "./RuntimeCenterStateStore.js";

/** How many recent messages the catalog samples to derive per-flow message counts/success rates. */
const CATALOG_SAMPLE_SIZE = 500;
/** How many recent messages Runtime Health aggregates over, for one flow, within the health window. */
const HEALTH_SAMPLE_SIZE = 200;
/** Runtime Health's rolling window, in hours. */
const HEALTH_WINDOW_HOURS = 24;
/** How many recent messages Integration Details fetches for one flow. */
const DETAILS_MESSAGE_LIMIT = 50;
/** Certificate-watch look-ahead horizon, in days (matches the Operations Workspace's own horizon). */
const CERT_HORIZON_DAYS = 30;
/** How many recent notifications are scanned for an active-alert text match. */
const NOTIFICATION_SCAN_LIMIT = 100;

function newDeploymentEventId(): string {
  return `deploy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Prepares Runtime Center information (architecture: Phase 12, Runtime Center Engine). Composes
 * `RuntimeEngine` (deployed artifact status), `MessageEngine` (per-flow message stats), `QueueEngine`/
 * `CertificateEngine` (tenant-wide operator context) and `NotificationEngine` (alert matching) into
 * the Runtime Center's own DTOs. Never touches `config/*.json` directly.
 *
 * "Deployed iFlow" is any runtime artifact whose `type` contains "flow" (case-insensitive) — CPI's
 * `IntegrationRuntimeArtifacts` entity set can also carry non-flow artifact types (e.g. value mapping
 * designtime artifacts); this engine only catalogs integration flows, per spec ("List all deployed
 * iFlows").
 */
export class RuntimeCenterEngine {
  public constructor(
    private readonly runtime: RuntimeEngine,
    private readonly message: MessageEngine,
    private readonly queue: QueueEngine,
    private readonly certificate: CertificateEngine,
    private readonly notification: NotificationEngine,
    private readonly cache: OperationsCache,
    private readonly stateStore: RuntimeCenterStateStore = runtimeCenterStateStore,
  ) {}

  /** Lists every deployed integration flow, enriched with recent message stats and deployment count. */
  public async listCatalog(): Promise<readonly CatalogEntry[]> {
    return this.cache.dedupe("runtimeCenter.catalog", async () => {
      const [artifacts, sample] = await Promise.all([
        this.runtime.listArtifacts(),
        this.message.queryMessages(
          new OperationsQueryBuilder()
            .page(1)
            .pageSize(CATALOG_SAMPLE_SIZE)
            .sortBy("startTime")
            .desc()
            .build(),
        ),
      ]);
      const messagesByFlow = new Map<string, number>();
      const completedByFlow = new Map<string, number>();
      for (const message of sample.items) {
        messagesByFlow.set(
          message.integrationFlow,
          (messagesByFlow.get(message.integrationFlow) ?? 0) + 1,
        );
        if (message.status.toUpperCase() === "COMPLETED") {
          completedByFlow.set(
            message.integrationFlow,
            (completedByFlow.get(message.integrationFlow) ?? 0) + 1,
          );
        }
      }
      return artifacts
        .filter((artifact) => artifact.type.toLowerCase().includes("flow"))
        .map((artifact) => {
          const recentMessageCount = messagesByFlow.get(artifact.name) ?? 0;
          const completed = completedByFlow.get(artifact.name) ?? 0;
          const successRatePct =
            recentMessageCount === 0 ? 0 : Math.round((completed / recentMessageCount) * 100);
          const timeline = this.ensureTimelineSeeded(artifact);
          return {
            artifactId: artifact.artifactId,
            name: artifact.name,
            type: artifact.type,
            version: artifact.version,
            status: artifact.status,
            humanReadableStatus: artifact.humanReadableStatus,
            health: artifact.health,
            deployedOn: artifact.deployedOn,
            deployedBy: artifact.deployedBy,
            deploymentCount: timeline.length,
            recentMessageCount,
            successRatePct,
          } satisfies CatalogEntry;
        });
    });
  }

  /** Composes the full Integration Details view for one deployed artifact. */
  public async getDetails(artifactId: string): Promise<IntegrationDetails | undefined> {
    const artifact = await this.runtime.getArtifact(artifactId);
    if (artifact === undefined) {
      return undefined;
    }
    const [messages, queues, certificateWatch, notifications] = await Promise.all([
      this.message.queryMessages(
        new OperationsQueryBuilder()
          .integrationFlow(artifact.name)
          .page(1)
          .pageSize(DETAILS_MESSAGE_LIMIT)
          .sortBy("startTime")
          .desc()
          .build(),
      ),
      this.queue.listQueues(),
      this.certificate.listExpiring(CERT_HORIZON_DAYS),
      this.notification.listNotifications({ skip: 0, top: NOTIFICATION_SCAN_LIMIT }),
    ]);
    return {
      artifactId: artifact.artifactId,
      name: artifact.name,
      type: artifact.type,
      version: artifact.version,
      status: artifact.status,
      humanReadableStatus: artifact.humanReadableStatus,
      health: artifact.health,
      deployedOn: artifact.deployedOn,
      deployedBy: artifact.deployedBy,
      errorText: artifact.errorText,
      recentMessages: messages.items,
      relatedQueues: queues,
      certificateWatch,
      dependencies: [],
      senderSystems: RuntimeCenterEngine.distinct(messages.items.map((message) => message.sender)),
      receiverSystems: RuntimeCenterEngine.distinct(
        messages.items.map((message) => message.receiver),
      ),
      activeAlerts: RuntimeCenterEngine.matchAlerts(notifications.items, artifact.name),
    };
  }

  /** Composes Runtime Health (score, success rate, average runtime, failure trend, active alerts). */
  public async getHealth(artifactId: string): Promise<RuntimeHealthSummary | undefined> {
    const artifact = await this.runtime.getArtifact(artifactId);
    if (artifact === undefined) {
      return undefined;
    }
    const now = new Date();
    const from = new Date(now.getTime() - HEALTH_WINDOW_HOURS * 3_600_000).toISOString();
    const to = now.toISOString();
    const [messages, notifications] = await Promise.all([
      this.message.queryMessages(
        new OperationsQueryBuilder()
          .integrationFlow(artifact.name)
          .dateFrom(from)
          .dateTo(to)
          .page(1)
          .pageSize(HEALTH_SAMPLE_SIZE)
          .sortBy("startTime")
          .desc()
          .build(),
      ),
      this.notification.listNotifications({ skip: 0, top: NOTIFICATION_SCAN_LIMIT }),
    ]);
    const failed = messages.items.filter(
      (message) => message.severity === "error" || message.severity === "critical",
    ).length;
    this.stateStore.recordFailureSample(artifactId, failed);
    const successRatePct =
      messages.items.length === 0
        ? 100
        : Math.round(((messages.items.length - failed) / messages.items.length) * 100);
    const durations = messages.items
      .map((message) => message.processingTimeMs)
      .filter((duration): duration is number => duration !== undefined);
    const averageRuntimeMs =
      durations.length === 0
        ? undefined
        : Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
    const activeAlerts = RuntimeCenterEngine.matchAlerts(notifications.items, artifact.name);
    return {
      artifactId: artifact.artifactId,
      name: artifact.name,
      healthScore: RuntimeCenterEngine.computeHealthScore(
        artifact.health,
        successRatePct,
        activeAlerts.length,
      ),
      successRatePct,
      averageRuntimeMs,
      failureTrend: this.stateStore.failureTrend(artifactId),
      activeAlerts,
    };
  }

  /** Lists an artifact's Deployment Timeline, seeding it from the artifact's current state if empty. */
  public async getDeploymentTimeline(
    artifactId: string,
  ): Promise<readonly DeploymentEvent[] | undefined> {
    const artifact = await this.runtime.getArtifact(artifactId);
    if (artifact === undefined) {
      return undefined;
    }
    return this.ensureTimelineSeeded(artifact);
  }

  /**
   * Redeploys (restarts) an artifact and records a `"redeployed"` Deployment Timeline event.
   * @param artifactId the runtime artifact id.
   * @param actor the operator performing the redeploy, for the timeline entry.
   * @returns the recorded event, or `undefined` when the artifact is unknown after the restart
   *   completes (a mock-mode edge case — `restartArtifact` does not itself validate existence).
   */
  public async redeploy(artifactId: string, actor: string): Promise<DeploymentEvent | undefined> {
    const before = await this.runtime.getArtifact(artifactId);
    if (before !== undefined) {
      // Seeds the pre-redeploy "deployed" entry first, so the timeline reads as a real history
      // (previous deployment, then this redeploy) rather than starting mid-story.
      this.ensureTimelineSeeded(before);
    }
    await this.runtime.restartArtifact(artifactId);
    const refreshed = await this.runtime.getArtifact(artifactId);
    if (refreshed === undefined) {
      return undefined;
    }
    const event: DeploymentEvent = {
      eventId: newDeploymentEventId(),
      artifactId,
      kind: "redeployed",
      version: refreshed.version,
      timestamp: new Date().toISOString(),
      actor,
      note: `Redeployed by ${actor}.`,
    };
    this.stateStore.recordTimelineEvent(event);
    return event;
  }

  // -----------------------------------------------------------------------------------------------

  private ensureTimelineSeeded(artifact: RuntimeSummary): readonly DeploymentEvent[] {
    const existing = this.stateStore.listTimeline(artifact.artifactId);
    if (existing.length > 0) {
      return existing;
    }
    this.stateStore.recordTimelineEvent({
      eventId: `deploy-seed-${artifact.artifactId}`,
      artifactId: artifact.artifactId,
      kind: "deployed",
      version: artifact.version,
      timestamp: artifact.deployedOn ?? new Date().toISOString(),
      actor: artifact.deployedBy ?? "unknown",
      note: "Currently deployed version, observed at first Runtime Center access.",
    });
    return this.stateStore.listTimeline(artifact.artifactId);
  }

  private static distinct(values: readonly string[]): readonly string[] {
    return [...new Set(values)];
  }

  private static matchAlerts<T extends { readonly title: string; readonly description: string }>(
    notifications: readonly T[],
    flowName: string,
  ): readonly T[] {
    return notifications.filter(
      (notification) =>
        notification.title.includes(flowName) || notification.description.includes(flowName),
    );
  }

  /**
   * Composite 0–100 health score: a runtime-status baseline, averaged with the success rate, then
   * penalized per matched active alert. No historical baseline exists to calibrate a more precise
   * model against — a documented heuristic, mirroring `RecoveryEngine`'s own health-score treatment.
   */
  private static computeHealthScore(
    runtimeHealth: HealthStatus,
    successRatePct: number,
    activeAlertCount: number,
  ): number {
    const baseline = runtimeHealth === "healthy" ? 100 : runtimeHealth === "warning" ? 60 : 20;
    const score = Math.round((baseline + successRatePct) / 2) - activeAlertCount * 10;
    return Math.max(0, Math.min(100, score));
  }
}
