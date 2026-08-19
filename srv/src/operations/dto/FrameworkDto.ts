/**
 * Business-friendly DTOs for processing-framework detection and framework-aware recovery (Phase 13).
 *
 * Two **independent** axes run through this file, and they are deliberately never merged into one
 * enum:
 *
 * - {@link ProcessingFramework} answers *"which processing framework owns this message?"* — an
 *   identity, derived from `config/frameworks.json`'s detection rules.
 * - {@link RecoveryState} answers *"what condition is this message in right now?"* — an operational
 *   state, derived from the message's own status plus (for the authoritative value) real queue
 *   probes.
 *
 * A failed TPM V2 message is `framework: "TPM_V2"` **and** `recoveryState: "DLQ_RECOVERY_AVAILABLE"`;
 * it is never a single fused "TPM_FAILURE" value, because failure state is not a framework and the
 * two filter independently.
 *
 * Nothing here is persisted — every value is recomputed per request from live MPL/queue data.
 */

/**
 * Which processing framework a message belongs to.
 *
 * `TPM_V2`/`JMS_FRAMEWORK`/`COMMON_IDOC_ROUTER`/`IDOC_STATUS_SYNC` mirror the configurable ids in
 * `config/frameworks.json`. The remaining two are detection *outcomes* and are never configurable:
 * - `NON_FRAMEWORK` — rules ran and positively indicate the message is outside every known framework.
 * - `UNKNOWN` — no rule matched with enough evidence to decide. Reported with the evidence trail
 *   explaining why, per the project's never-fabricate rule; it is not a synonym for `NON_FRAMEWORK`.
 */
export type ProcessingFramework =
  | "TPM_V2"
  | "JMS_FRAMEWORK"
  | "COMMON_IDOC_ROUTER"
  | "IDOC_STATUS_SYNC"
  | "NON_FRAMEWORK"
  | "UNKNOWN";

/**
 * How strong the evidence behind a {@link FrameworkDetection} is.
 *
 * - `confirmed` — direct evidence: the required correlation flows are present, or the message was
 *   actually found sitting on one of the framework's queues.
 * - `probable`  — indirect evidence only, e.g. the integration-flow *name* matches a configured
 *   pattern. Enough to label the row, not enough to treat as proven.
 * - `none`      — nothing matched; the framework is `UNKNOWN` or `NON_FRAMEWORK`.
 */
export type DetectionConfidence = "confirmed" | "probable" | "none";

/** What role the queue a message was found on plays in its framework's topology. */
export type QueueRole = "MAIN" | "DLQ" | "NONE" | "UNKNOWN";

/**
 * One rule evaluation, recorded whether it matched or not. The negative entries are the point: an
 * `UNKNOWN` result must be able to explain *why* nothing matched rather than silently shrugging.
 */
export interface DetectionEvidence {
  /** Identifies the rule, e.g. `TPM_V2.integrationFlowPatterns` or `JMS_FRAMEWORK.correlationFlowNames`. */
  readonly rule: string;
  readonly matched: boolean;
  /** Human-readable outcome, safe to surface directly in the UI. */
  readonly outcome: string;
}

/** One step in a human-readable recovery path (§8's `DLQ → MOVE → Inbound → RETRY` rendering). */
export interface RecoveryPathStep {
  readonly action: "LOCATED" | "MOVE" | "VERIFY" | "RETRY" | "MANUAL";
  /** The queue this step acts on/moves to, when the step is queue-scoped. */
  readonly queueName: string | undefined;
  /** Operator-facing description of the step. */
  readonly description: string;
}

/**
 * The full result of framework detection for one message. Runtime-derived only, never persisted.
 *
 * `detectedQueue`/`queueRole` are populated only by *full* detection (which probes queues); cheap,
 * list-facing detection leaves them `undefined`/`UNKNOWN` rather than guessing a location.
 */
export interface FrameworkDetection {
  readonly framework: ProcessingFramework;
  readonly confidence: DetectionConfidence;
  /** The rule id that decided the result, or `undefined` when nothing matched. */
  readonly matchedRule: string | undefined;
  /** The queue the message was actually found on (full detection only). */
  readonly detectedQueue: string | undefined;
  readonly queueRole: QueueRole;
  /** The MPL id detection ran against. */
  readonly sourceMplId: string;
  readonly correlationId: string;
  readonly evidence: readonly DetectionEvidence[];
  /**
   * The path recovery *would* take, when it can already be derived. Indicative on cheap detection
   * (topology-derived); authoritative once a recovery plan has really located the message.
   */
  readonly possibleRecoveryPath: readonly RecoveryPathStep[] | undefined;
}

/**
 * The operational condition of a message with respect to recovery (§7). Independent of
 * {@link ProcessingFramework} — see this file's header.
 *
 * - `RECOVERABLE`                   — a framework owns it and a strategy exists, but the exact action
 *                                     is not yet resolved (cheap, list-level answer).
 * - `RETRY_AVAILABLE`               — located on an active queue; retry can run in place.
 * - `DLQ_RECOVERY_AVAILABLE`        — located on a dead-letter queue; needs move → verify → retry.
 * - `RETRYING`                      — a recovery is in flight for this message right now (another
 *                                     caller holds the lock).
 * - `NOT_FOUND`                     — the framework is known but the message is on none of its
 *                                     queues (expired, deleted, or already processed).
 * - `MANUAL_INVESTIGATION_REQUIRED` — no framework owns it, or its queue cannot be resolved without
 *                                     an operator choosing one.
 * - `UNSUPPORTED`                   — recovery is not supported for this message at all.
 * - `COMPLETED`                     — a recovery in this process completed successfully.
 * - `FAILED_AGAIN`                  — a recovery ran and the message failed again.
 */
export type RecoveryState =
  | "RECOVERABLE"
  | "RETRY_AVAILABLE"
  | "DLQ_RECOVERY_AVAILABLE"
  | "RETRYING"
  | "NOT_FOUND"
  | "MANUAL_INVESTIGATION_REQUIRED"
  | "UNSUPPORTED"
  | "COMPLETED"
  | "FAILED_AGAIN";

/** The recovery action a strategy resolved for one message. */
export type RecoveryAction = "RETRY_IN_PLACE" | "MOVE_THEN_RETRY" | "MANUAL" | "NONE";

/** One validation requirement a strategy checked before allowing execution. */
export interface RecoveryValidation {
  readonly key: string;
  readonly passed: boolean;
  readonly message: string;
}

/**
 * A single message's resolved recovery plan — everything §2 requires a strategy to determine, plus
 * the human-readable explanation §8 renders.
 */
export interface MessageRecoveryPlan {
  readonly messageId: string;
  readonly framework: ProcessingFramework;
  readonly detection: FrameworkDetection;
  /** Whether this framework supports automated recovery at all. */
  readonly supported: boolean;
  /** Whether this specific message can be executed right now (`supported` *and* validations pass). */
  readonly executable: boolean;
  readonly recoveryState: RecoveryState;
  readonly action: RecoveryAction;
  /** Operator-facing location label, e.g. `"Processing DLQ"`. */
  readonly currentLocation: string | undefined;
  /** The queue the message is actually sitting on right now. */
  readonly currentQueue: string | undefined;
  readonly queueRole: QueueRole;
  /** The queue it must be moved to before retry, when `action` is `MOVE_THEN_RETRY`. */
  readonly targetQueue: string | undefined;
  readonly moveRequired: boolean;
  readonly validations: readonly RecoveryValidation[];
  readonly path: readonly RecoveryPathStep[];
  /** Plain-language explanation of the whole plan, safe to render directly. */
  readonly explanation: string;
}

/** The outcome classification every recovery operation resolves to (§10). */
export type RecoveryOutcomeStatus =
  | "accepted"
  | "successful"
  | "already-processed"
  | "failed"
  | "unavailable";

/** One executed step of a recovery, with its real upstream outcome. */
export interface RecoveryStepResult {
  readonly action: RecoveryPathStep["action"];
  readonly queueName: string | undefined;
  readonly succeeded: boolean;
  readonly detail: string;
}

/**
 * The real outcome of an executed recovery. Every step that ran is reported with what actually
 * happened upstream — a `MOVE` that was accepted but whose `VERIFY` could not find the message on the
 * target queue reports exactly that and stops, rather than proceeding to retry and claiming success.
 */
export interface MessageRecoveryOutcome {
  readonly messageId: string;
  readonly framework: ProcessingFramework;
  readonly status: RecoveryOutcomeStatus;
  readonly recoveryState: RecoveryState;
  readonly steps: readonly RecoveryStepResult[];
  /** Operator-facing summary of the outcome. */
  readonly note: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

/** A bulk recovery plan (§9) — what will run, and what is excluded and why. */
export interface RecoveryPlanBatch {
  readonly plans: readonly MessageRecoveryPlan[];
  /** Message ids that will actually be executed (`executable === true`). */
  readonly executableMessageIds: readonly string[];
  readonly executableCount: number;
  readonly excludedCount: number;
}
