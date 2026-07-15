/**
 * Client-side mirror of the Runtime Center DTOs served by `/api/v1/runtime-center`, itself composed
 * entirely from the Operations Engine's `RuntimeCenterEngine` (architecture: Phase 12). No SDK/CPI/
 * OData shape ever reaches this module — every field here matches
 * `srv/src/operations/dto/RuntimeCenterDto.ts`.
 */

/** The shared health vocabulary (`healthy`/`warning`/`critical`) every Operations DTO speaks. */
export type HealthStatus = "healthy" | "warning" | "critical";

/** One notification/alert, as surfaced by the Operations Engine's NotificationEngine. */
export interface NotificationSummary {
  readonly notificationId: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly raisedAt: string;
  readonly tags: readonly string[];
}

/** One deployed integration flow, enriched with recent message stats, for the Integration Catalog. */
export interface CatalogEntry {
  readonly artifactId: string;
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly health: HealthStatus;
  readonly deployedOn: string | undefined;
  readonly deployedBy: string | undefined;
  readonly deploymentCount: number;
  readonly recentMessageCount: number;
  readonly successRatePct: number;
}

/** Direction of an integration flow's failure count across recent samples (session-only history). */
export type FailureTrend = "increasing" | "stable" | "decreasing";

/** Composite runtime health view for one integration flow. */
export interface RuntimeHealthSummary {
  readonly artifactId: string;
  readonly name: string;
  readonly healthScore: number;
  readonly successRatePct: number;
  readonly averageRuntimeMs: number | undefined;
  readonly failureTrend: FailureTrend;
  readonly activeAlerts: readonly NotificationSummary[];
}

/** The kind of one Deployment Timeline event. */
export type DeploymentEventKind = "deployed" | "redeployed";

/** One entry in an integration flow's Deployment Timeline — session-only, future persistence ready. */
export interface DeploymentEvent {
  readonly eventId: string;
  readonly artifactId: string;
  readonly kind: DeploymentEventKind;
  readonly version: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly note: string;
}

/** A minimal message summary, as surfaced by the Operations Engine's MessageEngine. */
export interface MessageSummary {
  readonly messageId: string;
  readonly correlationId: string;
  readonly integrationFlow: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly processingTimeMs: number | undefined;
  readonly processingTimeHuman: string;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId: string | undefined;
  readonly messageType: string | undefined;
  readonly customStatus: string | undefined;
}

/** A minimal queue summary, as surfaced by the Operations Engine's QueueEngine. */
export interface QueueSummary {
  readonly queueName: string;
  readonly displayName: string;
  readonly description: string;
  readonly state: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly capacityUsedPct: number;
  readonly utilization: number;
  readonly health: HealthStatus;
  readonly deadLetterQueue: string;
  readonly retryQueue: string;
  readonly priority: number;
  readonly retryStrategy: string;
  readonly maxRetries: number;
}

/** A minimal certificate summary, as surfaced by the Operations Engine's CertificateEngine. */
export interface CertificateSummary {
  readonly alias: string;
  readonly keyType: string;
  readonly owner: string | undefined;
  readonly issuer: string | undefined;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string | undefined;
  readonly daysRemaining: number;
  readonly health: HealthStatus;
}

/**
 * The full Integration Details view for one deployed artifact. `relatedQueues`/`certificateWatch`
 * are tenant-wide (no queue/certificate-to-integration-flow mapping exists in this domain model) and
 * `dependencies` is reserved-but-empty (no dependency graph data source exists yet) — both honestly
 * documented server-side rather than fabricated.
 */
export interface IntegrationDetails {
  readonly artifactId: string;
  readonly name: string;
  readonly type: string;
  readonly version: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly health: HealthStatus;
  readonly deployedOn: string | undefined;
  readonly deployedBy: string | undefined;
  readonly errorText: string | undefined;
  readonly recentMessages: readonly MessageSummary[];
  readonly relatedQueues: readonly QueueSummary[];
  readonly certificateWatch: readonly CertificateSummary[];
  readonly dependencies: readonly string[];
  readonly senderSystems: readonly string[];
  readonly receiverSystems: readonly string[];
  readonly activeAlerts: readonly NotificationSummary[];
}
