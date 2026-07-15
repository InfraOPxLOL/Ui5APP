import type { HealthStatus, Severity } from "../../operations/transform/index.js";
import type {
  CertificateSummary,
  MessageSummary,
  NotificationSummary,
  QueueSummary,
  RuntimeSummary,
  StatisticsSummary,
} from "../../operations/dto/index.js";

/**
 * Data transfer objects for the Operations module — the HTTP contract behind
 * `/api/v1/operations`. Every field is composed by {@link OperationsService} from the **Operations
 * Engine** (Phase 6); no SDK/CPI/OData shape ever appears here. The Operations Workspace frontend
 * consumes only these DTOs (architecture: UI → Operations Engine → SDK → Integration Suite).
 *
 * `HealthStatus`/`Severity` are the Operations Engine's own canonical unions, re-used verbatim so
 * health and severity mean exactly the same thing on both sides of the wire.
 */

/** A reusable operations health widget (§3): one health dimension with a recommended action. */
export interface HealthWidgetDto {
  /** Stable widget id (`tenant` | `runtime` | `certificate` | `queue` | `deployment` | `alert`). */
  readonly id: string;
  /** i18n-key-free display title (already localized server-side is avoided — the key is sent). */
  readonly titleKey: string;
  readonly health: HealthStatus;
  /** Short, human status line (e.g. "3 of 24 artifacts erroring"). */
  readonly statusText: string;
  readonly severity: Severity;
  /** Headline count driving the widget (e.g. failing artifacts). */
  readonly value: number;
  /** Denominator for the headline count (e.g. total artifacts); 0 when not applicable. */
  readonly total: number;
  readonly description: string;
  /** The single next action an operator should consider; empty when healthy. */
  readonly recommendedAction: string;
}

/** A reusable interface (integration-flow) summary card (§9). */
export interface InterfaceSummaryDto {
  readonly name: string;
  readonly statusText: string;
  readonly health: HealthStatus;
  readonly lastExecution: string | undefined;
  readonly averageRuntimeMs: number | undefined;
  readonly averageRuntimeHuman: string;
  readonly messageCount: number;
  readonly failures: number;
  readonly warnings: number;
}

/** The kind of a timeline event (§8), driving its icon/colour on the client. */
export type TimelineEventKind =
  | "failure"
  | "recovery"
  | "deployment"
  | "alert"
  | "runtime"
  | "queue"
  | "certificate";

/** One entry on the operations timeline (§8). */
export interface TimelineEventDto {
  readonly id: string;
  readonly kind: TimelineEventKind;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly timestamp: string;
  readonly source: string;
}

/** A compact "quick insight" chip on the overview (§2). */
export interface QuickInsightDto {
  readonly id: string;
  readonly labelKey: string;
  readonly value: string;
  readonly severity: Severity;
  readonly hint: string;
}

/** The statistics window the overview was computed over. */
export interface OperationsWindowDto {
  readonly from: string;
  readonly to: string;
  readonly hours: number;
}

/**
 * The single aggregated view the Operations Overview page consumes (§2). One backend round trip
 * fans out across the Operations Engine's message/runtime/queue/certificate/notification engines and
 * composes them here, so the client never orchestrates multiple calls itself.
 */
export interface OperationsOverviewDto {
  readonly generatedAt: string;
  readonly window: OperationsWindowDto;
  readonly health: readonly HealthWidgetDto[];
  readonly statistics: StatisticsSummary;
  readonly runtimeHealthCounts: Readonly<Record<HealthStatus, number>>;
  readonly topInterfaces: readonly InterfaceSummaryDto[];
  readonly recentFailures: readonly MessageSummary[];
  readonly recentNotifications: readonly NotificationSummary[];
  readonly timeline: readonly TimelineEventDto[];
  readonly quickInsights: readonly QuickInsightDto[];
}

/**
 * The aggregated result of the workspace search (§6): matches from every operational domain the
 * Operations Engine can search, in one response.
 */
export interface OperationsSearchResponseDto {
  readonly query: string;
  readonly messages: readonly MessageSummary[];
  readonly queues: readonly QueueSummary[];
  readonly certificates: readonly CertificateSummary[];
  readonly runtimeArtifacts: readonly RuntimeSummary[];
  readonly totalHits: number;
  readonly tookMs: number;
}
