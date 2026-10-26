import type {
  DeadLetterKind,
  FailedTransaction,
  FailedTransactionRetryResult,
  RecoveryOutcomeStatus,
  RecoveryPathStep,
  RetryHistory,
} from "../../service/failedTransactions/FailedTransactionsTypes";

/** Words the path summary uses; passed in so the text stays translatable. */
export interface PathLabels {
  readonly move: string;
  readonly verify: string;
  readonly retry: string;
  readonly manual: string;
}

/** Counts of retry outcomes, for the results dialog headline. */
export interface OutcomeTally {
  readonly accepted: number;
  readonly alreadyProcessed: number;
  readonly failed: number;
  readonly unavailable: number;
}

/**
 * Pure formatting for Failed Transactions. No UI5 imports, so every function is unit-testable.
 */
export default class FailedTransactionsFormatter {
  /** `ObjectStatus.state` for the dead-letter queue a message sits on. */
  public static deadLetterState(kind: DeadLetterKind | undefined): string {
    if (kind === "processing" || kind === "jms") {
      return "Error";
    }
    if (kind === "receiver" || kind === "router") {
      return "Warning";
    }
    return "None";
  }

  /** `NumericContent.valueColor` for a dead-letter queue's tile. */
  public static deadLetterColor(kind: DeadLetterKind | undefined): string {
    return kind === "processing" || kind === "jms" ? "Error" : "Critical";
  }

  /** The heading of a non-B2B row: its business flow, else its message type. */
  public static transactionTitle(row: FailedTransaction | undefined): string {
    return row?.businessFlow ?? row?.messageType ?? "—";
  }

  /** A transaction's path in one line. */
  public static pathText(path: readonly string[] | undefined): string {
    return (path ?? []).join(" → ");
  }

  /** Whether retrying this row first needs the operator to choose a queue. */
  public static needsQueueChoice(row: FailedTransaction | undefined): boolean {
    return row?.deadLetterKind === "jms" && (row.targetQueue ?? "") === "";
  }

  /** `ObjectStatus.state` for a retry outcome. Accepted is not a success: the retry was queued. */
  public static outcomeState(status: RecoveryOutcomeStatus | undefined): string {
    switch (status) {
      case "accepted":
      case "successful":
        return "Success";
      case "already-processed":
        return "Information";
      case "unavailable":
        return "Warning";
      case "failed":
        return "Error";
      default:
        return "None";
    }
  }

  /** `ObjectStatus.state` for a processing run's severity. */
  public static runState(severity: string | undefined): string {
    switch (severity) {
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      case "success":
        return "Success";
      default:
        return "None";
    }
  }

  /** Emphasis for the attempts counter: repeated failures deserve attention. */
  public static attemptsState(history: RetryHistory | undefined): string {
    const failed = history?.failedAttempts ?? 0;
    if (failed >= 3) {
      return "Error";
    }
    if (failed >= 2) {
      return "Warning";
    }
    return "None";
  }

  /** "SAP_TPM_COM_PROCESSING_… → Move to SAP_TPM_INBOUND_Q → Verify → Retry". */
  public static pathSummary(
    steps: readonly RecoveryPathStep[] | undefined,
    labels: PathLabels,
  ): string {
    if (steps === undefined || steps.length === 0) {
      return "";
    }
    return steps
      .map((step) => {
        switch (step.action) {
          case "LOCATED":
            return step.queueName ?? "";
          case "MOVE":
            return `${labels.move} ${step.queueName ?? ""}`.trim();
          case "VERIFY":
            return labels.verify;
          case "RETRY":
            return labels.retry;
          default:
            return labels.manual;
        }
      })
      .filter((text) => text !== "")
      .join(" → ");
  }

  /** The partner shown for a row's sending side: interchange first, broker header second. */
  public static senderPartner(row: FailedTransaction | undefined): string {
    return row?.interchange?.senderPartner ?? row?.sender ?? "—";
  }

  /** The partner shown for a row's receiving side. */
  public static receiverPartner(row: FailedTransaction | undefined): string {
    return row?.interchange?.receiverPartner ?? row?.receiver ?? "—";
  }

  /** "ASC-X12 · 850" from the interchange, falling back to the broker's message type. */
  public static document(row: FailedTransaction | undefined): string {
    const standard = row?.interchange?.documentStandard;
    const type = row?.interchange?.messageType ?? row?.messageType;
    const parts = [standard, type].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    return parts.length === 0 ? "—" : parts.join(" · ");
  }

  /** Counts each kind of outcome in a bulk result. */
  public static tally(results: readonly FailedTransactionRetryResult[]): OutcomeTally {
    const count = (statuses: readonly RecoveryOutcomeStatus[]): number =>
      results.filter((result) => statuses.includes(result.outcome.status)).length;
    return {
      accepted: count(["accepted", "successful"]),
      alreadyProcessed: count(["already-processed"]),
      failed: count(["failed"]),
      unavailable: count(["unavailable"]),
    };
  }

  /** The step a retry stopped at, or the last step when it ran to the end. */
  public static stoppedAt(result: FailedTransactionRetryResult): string {
    const failedStep = result.outcome.steps.find((step) => !step.succeeded);
    return (failedStep ?? result.outcome.steps.at(-1))?.detail ?? result.outcome.note;
  }
}
