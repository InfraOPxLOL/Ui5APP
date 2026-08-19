import type {
  MessageRecoveryPlan,
  ProcessingFramework,
  RecoveryPathStep,
  RecoveryState,
} from "../../service/messageMonitoring/MessageInvestigationTypes";

/**
 * Pure rendering helpers for framework-aware recovery (Phase 13, §8/§9).
 *
 * Deliberately framework-free — no UI5 imports, no controller state, no i18n bundle — so it is unit
 * testable in isolation, following the same precedent as
 * {@link module:./DetailBreadcrumb} (this codebase has no pattern for testing a full MVC controller,
 * so the logic worth testing is extracted into modules like this one).
 *
 * Display *labels* stay in the controller, which owns the i18n bundle; this module only decides
 * structure, ordering and semantic state.
 */

/** One row of the Recovery Plan dialog: `MSG001 | TPM V2 | DLQ → Inbound → Retry`. */
export interface RecoveryPlanRow {
  readonly messageId: string;
  readonly framework: ProcessingFramework;
  readonly recoveryState: RecoveryState;
  /** The compact one-line path shown in the dialog's third column. */
  readonly summary: string;
  /** Whether this message will actually be executed. */
  readonly executable: boolean;
  /** Why it is excluded, when it is not executable. */
  readonly excludedReason: string | undefined;
}

/**
 * Renders a recovery path as a compact single line, e.g.
 * `Common_JMS_ID_DLQ → MOVE → Common_JMS_ID_Ecom_P1 → RETRY`.
 *
 * The `VERIFY` step is intentionally omitted from this compact form: it is an internal safety gate
 * with no queue transition of its own, and including it makes the summary read as though the
 * operator must do something. It remains visible in the full step list.
 *
 * @param path the plan's path steps.
 * @returns the rendered line, or an empty string when there is no path.
 */
export function formatPathSummary(path: readonly RecoveryPathStep[]): string {
  if (path.length === 0) {
    return "";
  }
  const segments: string[] = [];
  for (const step of path) {
    if (step.action === "VERIFY") {
      continue;
    }
    if (step.action === "LOCATED") {
      segments.push(step.queueName ?? "");
      continue;
    }
    if (step.action === "MANUAL") {
      segments.push("MANUAL");
      continue;
    }
    segments.push(step.action);
    if (step.queueName !== undefined && step.action === "MOVE") {
      segments.push(step.queueName);
    }
  }
  return segments.filter((segment) => segment !== "").join(" → ");
}

/**
 * Renders the multi-line path shown in the Recovery tab (§8's mockup):
 *
 * ```
 * Processing DLQ
 *     ↓ MOVE
 * SAP_TPM_INBOUND_Q
 *     ↓ RETRY
 * ```
 *
 * @param path the plan's path steps.
 * @returns the rendered block, or an empty string when there is no path.
 */
export function formatPathBlock(path: readonly RecoveryPathStep[]): string {
  if (path.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const step of path) {
    if (step.action === "LOCATED") {
      lines.push(step.queueName ?? step.description);
      continue;
    }
    if (step.action === "MANUAL") {
      lines.push("    ↓ MANUAL INVESTIGATION");
      continue;
    }
    if (step.action === "VERIFY") {
      lines.push("    ↓ VERIFY");
      continue;
    }
    lines.push(`    ↓ ${step.action}`);
    if (step.queueName !== undefined && step.action === "MOVE") {
      lines.push(step.queueName);
    }
  }
  return lines.join("\n");
}

/**
 * Converts a batch plan's entries into dialog rows, ordered so the messages that will actually run
 * appear first — an operator confirming a bulk action should see what is about to happen before
 * what is being skipped.
 *
 * @param plans every plan in the batch, executable or not.
 * @returns the dialog rows.
 */
export function toPlanRows(plans: readonly MessageRecoveryPlan[]): readonly RecoveryPlanRow[] {
  const rows = plans.map((plan) => ({
    messageId: plan.messageId,
    framework: plan.framework,
    recoveryState: plan.recoveryState,
    summary: formatPathSummary(plan.path),
    executable: plan.executable,
    excludedReason: plan.executable ? undefined : firstFailedValidation(plan) ?? plan.explanation,
  }));
  return [...rows].sort((left, right) => Number(right.executable) - Number(left.executable));
}

/**
 * The message from the first validation a plan failed — a precise reason like "no recovery target is
 * configured", preferred over the plan's general explanation.
 */
function firstFailedValidation(plan: MessageRecoveryPlan): string | undefined {
  return plan.validations.find((validation) => !validation.passed)?.message;
}

/**
 * Maps a recovery state to a UI5 `ValueState`, so the grid's availability indicator reads at a
 * glance. Actionable states are `Success`, states needing a human are `Warning`, genuine failure is
 * `Error`, and states carrying no call to action are neutral.
 *
 * @param state the recovery state.
 * @returns the UI5 value state name.
 */
export function recoveryStateValueState(state: RecoveryState): string {
  switch (state) {
    case "RETRY_AVAILABLE":
    case "DLQ_RECOVERY_AVAILABLE":
    case "RECOVERABLE":
      return "Success";
    case "MANUAL_INVESTIGATION_REQUIRED":
    case "NOT_FOUND":
      return "Warning";
    case "FAILED_AGAIN":
      return "Error";
    case "RETRYING":
      return "Information";
    default:
      return "None";
  }
}

/**
 * Maps a recovery state to an icon for the grid's availability indicator.
 * @param state the recovery state.
 * @returns the `sap-icon://…` URI.
 */
export function recoveryStateIcon(state: RecoveryState): string {
  switch (state) {
    case "RETRY_AVAILABLE":
    case "DLQ_RECOVERY_AVAILABLE":
    case "RECOVERABLE":
      return "sap-icon://redo";
    case "MANUAL_INVESTIGATION_REQUIRED":
      return "sap-icon://request";
    case "NOT_FOUND":
      return "sap-icon://search";
    case "RETRYING":
      return "sap-icon://pending";
    case "COMPLETED":
      return "sap-icon://accept";
    case "FAILED_AGAIN":
      return "sap-icon://error";
    default:
      return "sap-icon://border";
  }
}

/**
 * Maps a detection confidence to a UI5 `ValueState`.
 *
 * `probable` is `Warning` on purpose: it means the classification rests on a name-shape match alone,
 * and an operator about to act on it should see that it is indicative rather than proven.
 *
 * @param confidence the detection confidence.
 * @returns the UI5 value state name.
 */
export function confidenceValueState(confidence: string): string {
  switch (confidence) {
    case "confirmed":
      return "Success";
    case "probable":
      return "Warning";
    default:
      return "None";
  }
}
