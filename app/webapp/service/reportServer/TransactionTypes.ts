import type { TimePresetKey } from "../../core/utils/TimePresets";

/** Client-side mirrors of the non-B2B transaction API (`/api/v1/report-server/transactions`). */

export type TransactionFramework = "JMS_FRAMEWORK" | "COMMON_IDOC_ROUTER";
export type TransactionStatusCategory = "success" | "error" | "inProgress" | "unknown";
export type JmsStage = "queued" | "retrying" | "failed" | "delivered";
export type RouterStage = "routed" | "failed" | "processing";

export interface TransactionStep {
  readonly messageId: string;
  readonly integrationFlow: string;
  readonly label: string;
  readonly role: "framework" | "business";
  readonly framework?: TransactionFramework;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly statusCategory: TransactionStatusCategory;
  readonly startTime: string;
  readonly endTime?: string;
  readonly processingTimeHuman: string;
}

export interface JmsInvolvement {
  readonly queue?: string;
  readonly queueSource?: "header" | "consumerFlow";
  readonly stage: JmsStage;
  readonly deadLetterQueue?: string;
}

export interface RouterInvolvement {
  readonly inbound?: string;
  readonly stage: RouterStage;
  readonly queue?: string;
  readonly deadLetterQueue?: string;
}

export interface TransactionSummary {
  readonly correlationId: string;
  readonly businessFlow?: string;
  readonly headline: TransactionStep;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId?: string;
  readonly messageType?: string;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly statusCategory: TransactionStatusCategory;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly path: readonly string[];
  readonly frameworks: readonly TransactionFramework[];
  readonly jms?: JmsInvolvement;
  readonly router?: RouterInvolvement;
  readonly stepCount: number;
}

export interface TransactionError {
  readonly messageId: string;
  readonly integrationFlow: string;
  readonly label: string;
  readonly text: string;
  readonly category?: string;
}

export interface ParkedMessage {
  readonly queueName: string;
  readonly jmsMessageId: string;
  readonly framework: TransactionFramework;
  readonly retryCount: number;
  readonly parkedAt: string;
  readonly retryTarget?: string;
}

export interface TransactionDetail extends TransactionSummary {
  readonly steps: readonly TransactionStep[];
  readonly errors?: readonly TransactionError[];
  readonly parked?: readonly ParkedMessage[];
  readonly queueHeader?: string;
}

export interface TransactionListResponse {
  readonly items: readonly TransactionSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly logsTotal: number;
  readonly hasMore: boolean;
  readonly b2bExcluded: number;
}

export type TransactionFrameworkFilter = "" | "jms" | "router" | "none";

/** The non-B2B filters as held in the view model (empty string = not set). */
export interface TransactionFilters {
  timePreset: TimePresetKey;
  dateFrom: Date | null;
  dateTo: Date | null;
  status: string;
  sender: string;
  receiver: string;
  integrationFlow: string;
  framework: TransactionFrameworkFilter;
  // Advanced search
  correlationId: string;
  mplId: string;
  applicationId: string;
  messageType: string;
}

/** The query-string form of {@link TransactionFilters}. */
export interface TransactionQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly status?: string;
  readonly sender?: string;
  readonly receiver?: string;
  readonly integrationFlow?: string;
  readonly framework?: string;
  readonly correlationId?: string;
  readonly mplId?: string;
  readonly applicationId?: string;
  readonly messageType?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
