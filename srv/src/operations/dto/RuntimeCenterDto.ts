import type { HealthStatus } from "../transform/index.js";
import type { MessageSummary } from "./MessageDto.js";
import type { QueueSummary } from "./QueueDto.js";
import type { CertificateSummary } from "./CertificateDto.js";
import type { NotificationSummary } from "./NotificationDto.js";

/**
 * Business-friendly DTOs for the Runtime Center (architecture: Phase 12, Runtime Center Engine).
 * Built entirely from `RuntimeEngine`/`MessageEngine`/`QueueEngine`/`CertificateEngine`/
 * `NotificationEngine` — no SDK/CPI/OData shape ever crosses this boundary.
 *
 * Two fields the domain model genuinely has no per-flow mapping for are handled honestly rather than
 * fabricated: {@link IntegrationDetails.relatedQueues}/{@link IntegrationDetails.certificateWatch} are
 * tenant-wide (no queue/certificate-to-integration-flow linkage exists anywhere in this SDK), and
 * {@link IntegrationDetails.dependencies} is reserved-but-empty (no dependency graph data source
 * exists yet) — both documented on the fields themselves, matching `RecoveryEngine`'s own treatment
 * of its `runtimeAvailable` validation check.
 */

/** One entry in the Integration Catalog — a deployed runtime artifact enriched with recent message stats. */
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
  /** Recorded deployment events for this artifact (session-only — see `RuntimeCenterStateStore`). */
  readonly deploymentCount: number;
  /** Messages for this flow within the sampled working set (not the tenant's entire history). */
  readonly recentMessageCount: number;
  readonly successRatePct: number;
}

/** Direction of an integration flow's failure count across recent samples (session-only history). */
export type FailureTrend = "increasing" | "stable" | "decreasing";

/** Composite runtime health view for one integration flow. */
export interface RuntimeHealthSummary {
  readonly artifactId: string;
  readonly name: string;
  /** 0–100 composite score (runtime status, success rate, active alerts). */
  readonly healthScore: number;
  readonly successRatePct: number;
  readonly averageRuntimeMs: number | undefined;
  readonly failureTrend: FailureTrend;
  /**
   * Alerts whose title/description mention this flow by name — a genuine text match against real
   * alert data, not a fabricated per-flow alert feed (no structured alert-to-flow reference exists in
   * this domain model).
   */
  readonly activeAlerts: readonly NotificationSummary[];
}

/** The kind of one Deployment Timeline event. */
export type DeploymentEventKind = "deployed" | "redeployed";

/**
 * One entry in an integration flow's Deployment Timeline — session-only, future persistence ready
 * (backed by `RuntimeCenterStateStore`, a process-lifetime singleton, mirroring Recovery Center's
 * `RecoveryStateStore`). SAP Integration Suite's runtime artifact API is a current-state snapshot,
 * not a history API, so the timeline is seeded from that one real data point (`"deployed"`) and grows
 * only from actions actually taken through this Runtime Center (`"redeployed"`) — never fabricated
 * historical entries.
 */
export interface DeploymentEvent {
  readonly eventId: string;
  readonly artifactId: string;
  readonly kind: DeploymentEventKind;
  readonly version: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly note: string;
}

/** The full Integration Details view for one deployed artifact. */
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
  /** Recent messages for this flow (bounded working set — see `MessageEngine`'s own doc comment). */
  readonly recentMessages: readonly MessageSummary[];
  /**
   * Every configured queue on the tenant, for operator context — **not** filtered to queues this
   * specific flow uses; no queue-to-integration-flow mapping exists in this domain model.
   */
  readonly relatedQueues: readonly QueueSummary[];
  /**
   * Certificates expiring soon on the tenant, for operator context — **not** filtered to
   * certificates this specific flow uses, for the same reason as `relatedQueues`.
   */
  readonly certificateWatch: readonly CertificateSummary[];
  /** Reserved for a future phase — no dependency graph data source exists in this domain model yet. */
  readonly dependencies: readonly string[];
  readonly senderSystems: readonly string[];
  readonly receiverSystems: readonly string[];
  readonly activeAlerts: readonly NotificationSummary[];
}
