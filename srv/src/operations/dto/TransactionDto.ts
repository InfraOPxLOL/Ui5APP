import type { Severity } from "../transform/index.js";

/**
 * Data transfer objects for non-B2B transactions: every processing log sharing one correlation id,
 * folded into a single business transaction (the router flows, the JMS framework hops and the
 * business flow they deliver to).
 */

/** The in-house frameworks a non-B2B transaction can pass through. */
export type TransactionFramework = "JMS_FRAMEWORK" | "COMMON_IDOC_ROUTER";

/** Coarse status grouping for display. */
export type TransactionStatusCategory = "success" | "error" | "inProgress" | "unknown";

/** One processing log of the transaction, named by what it does in the chain. */
export interface TransactionStep {
  readonly messageId: string;
  readonly integrationFlow: string;
  /** "Router inbound (BTP_IS_CORE_LA)", "JMS queue consumer (NA_P1)", or the business flow's name. */
  readonly label: string;
  readonly role: "framework" | "business";
  readonly framework: TransactionFramework | undefined;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly severity: Severity;
  readonly statusCategory: TransactionStatusCategory;
  readonly startTime: string;
  readonly endTime: string | undefined;
  readonly processingTimeHuman: string;
}

/**
 * Where a message is in the JMS framework:
 * - `queued`    — the ingress dispatcher put it on its queue; no consumer has run yet;
 * - `retrying`  — a consumer picked it up and failed; the queue is retrying it;
 * - `failed`    — the consumer (or egress) failed and stopped retrying;
 * - `delivered` — the egress dispatcher handed it to the business flow.
 */
export type JmsStage = "queued" | "retrying" | "failed" | "delivered";

/** How the JMS queue of a message was determined. */
export type JmsQueueSource = "header" | "consumerFlow";

export interface JmsInvolvement {
  /** The JMS queue the message was routed to, when it could be determined. */
  readonly queue: string | undefined;
  readonly queueSource: JmsQueueSource | undefined;
  readonly stage: JmsStage;
  /** The central DLQ messages land on once the queue's retries are exhausted. */
  readonly deadLetterQueue: string | undefined;
}

/** Where a message is in the Common IDoc Router. */
export type RouterStage = "routed" | "failed" | "processing";

export interface RouterInvolvement {
  /** The inbound variant from the router flow's name, e.g. `BTP_IS_CORE_LA`. */
  readonly inbound: string | undefined;
  readonly stage: RouterStage;
  /** The router's processing queue (a retried router message goes back here). */
  readonly queue: string | undefined;
  readonly deadLetterQueue: string | undefined;
}

/** One non-B2B business transaction. */
export interface TransactionSummary {
  readonly correlationId: string;
  /** The business flow the frameworks delivered to; `undefined` when it has not run. */
  readonly businessFlow: string | undefined;
  /** The step the row is named after: the business flow, else the latest step. */
  readonly headline: TransactionStep;
  readonly sender: string;
  readonly receiver: string;
  readonly applicationId: string | undefined;
  readonly messageType: string | undefined;
  readonly status: string;
  readonly humanReadableStatus: string;
  readonly statusCategory: TransactionStatusCategory;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  /** The path in words, e.g. ["Common router (BTP_IS_CORE_LA)", "JMS · Common_JMS_ID_NA_P1", "IF_Order_to_S4"]. */
  readonly path: readonly string[];
  readonly frameworks: readonly TransactionFramework[];
  readonly jms: JmsInvolvement | undefined;
  readonly router: RouterInvolvement | undefined;
  readonly stepCount: number;
}

/** A transaction with every step, for the detail panel. */
export interface TransactionDetail extends TransactionSummary {
  /** Every processing log of the transaction, oldest first. */
  readonly steps: readonly TransactionStep[];
}
