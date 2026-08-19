import type { FrameworkConfig } from "../../config/schemas/index.js";
import type {
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  ProcessingFramework,
  RecoveryPathStep,
  RecoveryStepResult,
  RecoveryValidation,
  QueueRole,
} from "../dto/FrameworkDto.js";
import type { RecoveryContext, RecoveryStrategy } from "./RecoveryStrategy.js";

/** Where a message was found, and what that queue means in its framework's topology. */
export interface LocatedMessage {
  readonly queueName: string;
  readonly role: QueueRole;
  /** Operator-facing label for the location, e.g. `"Processing DLQ"`. */
  readonly locationLabel: string;
  /** The real retry count the tenant reports for the message on that queue. */
  readonly retryCount: number | undefined;
  /**
   * The queue this message must be moved to before retry, when the strategy already knows it and it
   * is *not* derivable from the static `dlqRecoveryMap` — the JMS framework's case, where the target
   * is whatever the message's own header resolved to.
   *
   * Carried on the located result rather than held as strategy state on purpose: one strategy
   * instance resolves many messages concurrently when a bulk recovery plan is built (§9), so any
   * per-message value kept on `this` would race between them.
   */
  readonly recoveryTarget?: string;
}

/**
 * Shared mechanics for every queue-backed framework strategy (TPM V2, JMS Framework, Common IDoc
 * Router, IDoc Status Sync).
 *
 * All four differ only in **where they look** for a message — TPM walks a four-queue traversal order,
 * the JMS framework reads its queue from a custom header, the other two have two-queue topologies.
 * What happens once the message is found is identical in every case, and lives here:
 *
 * ```
 * locate
 *   ├─ on an active queue ── validate ── RETRY in place
 *   └─ on a dead-letter queue ── MOVE (this message only)
 *                                 └─ VERIFY it arrived on the target
 *                                      └─ RETRY from the target
 * ```
 *
 * The verify step is not ceremony. `MoveMessagingMessages` returning 2xx means the tenant accepted
 * the request, not that the message is now on the target queue; issuing a retry against a queue the
 * message never reached would report a success that did not happen. So a failed verification aborts
 * before the retry and reports exactly how far the operation got (§7, and the project's standing
 * never-fabricate rule).
 *
 * Subclasses implement {@link locate} and, where their topology is not the configured one,
 * {@link resolveTarget}.
 */
export abstract class QueueRecoveryStrategyBase implements RecoveryStrategy {
  public abstract readonly framework: ProcessingFramework;

  protected constructor(protected readonly config: FrameworkConfig) {}

  /** @inheritdoc */
  public supports(detection: { readonly framework: ProcessingFramework }): boolean {
    return detection.framework === this.framework;
  }

  /**
   * Finds where the message currently is. Returns `undefined` when it is on none of this framework's
   * queues — an expected outcome (expired, deleted, or already processed), never an error.
   */
  protected abstract locate(context: RecoveryContext): Promise<LocatedMessage | undefined>;

  /**
   * The queue a dead-lettered message must be moved to before retry: the strategy's own
   * per-message answer when it has one, otherwise the configured `dlqRecoveryMap` entry.
   * `undefined` means the topology has no mapping, which downgrades the message to manual
   * investigation rather than inventing a destination.
   */
  private resolveTarget(located: LocatedMessage): string | undefined {
    return located.recoveryTarget ?? this.config.topology.dlqRecoveryMap[located.queueName];
  }

  /** @inheritdoc */
  public async resolve(context: RecoveryContext): Promise<MessageRecoveryPlan> {
    const located = await this.locate(context);

    if (located === undefined) {
      return this.plan(context, {
        supported: true,
        executable: false,
        recoveryState: "NOT_FOUND",
        action: "NONE",
        currentLocation: undefined,
        currentQueue: undefined,
        queueRole: "NONE",
        targetQueue: undefined,
        moveRequired: false,
        validations: [
          {
            key: "messageLocated",
            passed: false,
            message: `The message is not on any ${this.config.label} queue — it may have expired, been deleted, or already been processed.`,
          },
        ],
        path: [
          {
            action: "MANUAL",
            queueName: undefined,
            description: "Not found on any queue — manual investigation required.",
          },
        ],
        explanation: `This message belongs to ${this.config.label}, but it is not currently sitting on any of that framework's queues, so there is nothing to retry.`,
      });
    }

    if (located.role === "DLQ") {
      const targetQueue = this.resolveTarget(located);
      if (targetQueue === undefined) {
        return this.plan(context, {
          supported: true,
          executable: false,
          recoveryState: "MANUAL_INVESTIGATION_REQUIRED",
          action: "MANUAL",
          currentLocation: located.locationLabel,
          currentQueue: located.queueName,
          queueRole: "DLQ",
          targetQueue: undefined,
          moveRequired: true,
          validations: [
            {
              key: "dlqMappingExists",
              passed: false,
              message: `No recovery target is configured for dead-letter queue "${located.queueName}".`,
            },
          ],
          path: [
            {
              action: "LOCATED",
              queueName: located.queueName,
              description: `Found on "${located.queueName}".`,
            },
            {
              action: "MANUAL",
              queueName: undefined,
              description: "No configured recovery target — manual investigation required.",
            },
          ],
          explanation: `This message is parked on "${located.queueName}", but ${this.config.label} has no configured queue to move it back to, so it cannot be recovered automatically.`,
        });
      }

      return this.plan(context, {
        supported: true,
        executable: true,
        recoveryState: "DLQ_RECOVERY_AVAILABLE",
        action: "MOVE_THEN_RETRY",
        currentLocation: located.locationLabel,
        currentQueue: located.queueName,
        queueRole: "DLQ",
        targetQueue,
        moveRequired: true,
        validations: [
          {
            key: "messageLocated",
            passed: true,
            message: `Found on "${located.queueName}".`,
          },
          {
            key: "dlqMappingExists",
            passed: true,
            message: `"${located.queueName}" recovers to "${targetQueue}".`,
          },
        ],
        path: [
          {
            action: "LOCATED",
            queueName: located.queueName,
            description: located.locationLabel,
          },
          { action: "MOVE", queueName: targetQueue, description: `Move to "${targetQueue}".` },
          {
            action: "VERIFY",
            queueName: targetQueue,
            description: `Confirm it arrived on "${targetQueue}".`,
          },
          { action: "RETRY", queueName: targetQueue, description: `Retry from "${targetQueue}".` },
        ],
        explanation: `This message is parked on ${located.locationLabel} ("${located.queueName}"). Recovery moves this one message to "${targetQueue}", verifies it arrived, then retries it from there.`,
      });
    }

    return this.plan(context, {
      supported: true,
      executable: true,
      recoveryState: "RETRY_AVAILABLE",
      action: "RETRY_IN_PLACE",
      currentLocation: located.locationLabel,
      currentQueue: located.queueName,
      queueRole: "MAIN",
      targetQueue: located.queueName,
      moveRequired: false,
      validations: [
        { key: "messageLocated", passed: true, message: `Found on "${located.queueName}".` },
      ],
      path: [
        { action: "LOCATED", queueName: located.queueName, description: located.locationLabel },
        {
          action: "RETRY",
          queueName: located.queueName,
          description: `Retry from "${located.queueName}".`,
        },
      ],
      explanation: `This message is on the active queue "${located.queueName}"${located.retryCount === undefined ? "" : ` (retried ${located.retryCount} time(s) so far)`}, so it can be retried directly — no move needed.`,
    });
  }

  /** @inheritdoc */
  public async execute(
    context: RecoveryContext,
    plan: MessageRecoveryPlan,
  ): Promise<MessageRecoveryOutcome> {
    const startedAt = new Date().toISOString();
    const steps: RecoveryStepResult[] = [];
    const messageId = context.message.messageId;

    if (!plan.executable || plan.currentQueue === undefined) {
      return {
        messageId,
        framework: this.framework,
        status: "unavailable",
        recoveryState: plan.recoveryState,
        steps,
        note: plan.explanation,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    steps.push({
      action: "LOCATED",
      queueName: plan.currentQueue,
      succeeded: true,
      detail: `Confirmed on "${plan.currentQueue}".`,
    });

    let retryFrom = plan.currentQueue;

    if (plan.moveRequired) {
      const targetQueue = plan.targetQueue;
      if (targetQueue === undefined) {
        return QueueRecoveryStrategyBase.abort(
          messageId,
          this.framework,
          steps,
          startedAt,
          "MANUAL_INVESTIGATION_REQUIRED",
          "No target queue was resolved, so no move was attempted.",
        );
      }

      try {
        await context.queue.moveMessages(plan.currentQueue, targetQueue, [messageId]);
        steps.push({
          action: "MOVE",
          queueName: targetQueue,
          succeeded: true,
          detail: `Move from "${plan.currentQueue}" to "${targetQueue}" accepted by the tenant.`,
        });
      } catch (error) {
        steps.push({
          action: "MOVE",
          queueName: targetQueue,
          succeeded: false,
          detail: `Move from "${plan.currentQueue}" to "${targetQueue}" failed: ${QueueRecoveryStrategyBase.describe(error)}`,
        });
        return QueueRecoveryStrategyBase.abort(
          messageId,
          this.framework,
          steps,
          startedAt,
          "DLQ_RECOVERY_AVAILABLE",
          `The message was not moved and remains on "${plan.currentQueue}". Nothing was retried.`,
        );
      }

      // Acceptance is not arrival. Retrying a queue the message never reached would report a success
      // that did not happen, so this check is a hard gate rather than a formality.
      const arrived = await context.queue.getMessage(targetQueue, messageId);
      if (arrived === undefined) {
        steps.push({
          action: "VERIFY",
          queueName: targetQueue,
          succeeded: false,
          detail: `The move was accepted, but the message could not be found on "${targetQueue}" afterwards.`,
        });
        return QueueRecoveryStrategyBase.abort(
          messageId,
          this.framework,
          steps,
          startedAt,
          "MANUAL_INVESTIGATION_REQUIRED",
          `The move was accepted but could not be verified, so no retry was issued. Check "${plan.currentQueue}" and "${targetQueue}" before retrying manually.`,
        );
      }
      steps.push({
        action: "VERIFY",
        queueName: targetQueue,
        succeeded: true,
        detail: `Confirmed present on "${targetQueue}".`,
      });
      retryFrom = targetQueue;
    }

    try {
      const result = await context.queue.retryMessage(messageId, retryFrom, context.reason);
      if (!result.accepted) {
        steps.push({
          action: "RETRY",
          queueName: retryFrom,
          succeeded: false,
          detail: `The tenant did not accept the retry on "${retryFrom}".`,
        });
        return QueueRecoveryStrategyBase.abort(
          messageId,
          this.framework,
          steps,
          startedAt,
          "FAILED_AGAIN",
          `The retry was rejected by the tenant. The message is on "${retryFrom}".`,
        );
      }
      steps.push({
        action: "RETRY",
        queueName: retryFrom,
        succeeded: true,
        detail: `Retry accepted on "${retryFrom}".`,
      });
    } catch (error) {
      steps.push({
        action: "RETRY",
        queueName: retryFrom,
        succeeded: false,
        detail: `Retry on "${retryFrom}" failed: ${QueueRecoveryStrategyBase.describe(error)}`,
      });
      return QueueRecoveryStrategyBase.abort(
        messageId,
        this.framework,
        steps,
        startedAt,
        "FAILED_AGAIN",
        `The retry call failed. The message is on "${retryFrom}".`,
      );
    }

    return {
      messageId,
      framework: this.framework,
      // "accepted", not "successful": the tenant has taken the retry, but whether the message then
      // processes cleanly is only observable later in the MPL — claiming success here would be the
      // exact overreach §7 forbids.
      status: "accepted",
      recoveryState: "RETRYING",
      steps,
      note: plan.moveRequired
        ? `Moved to "${retryFrom}", verified, and retry accepted. Watch the message's processing log for the outcome.`
        : `Retry accepted on "${retryFrom}". Watch the message's processing log for the outcome.`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // --- Helpers -----------------------------------------------------------------

  /** Assembles the plan DTO, filling in the parts every branch shares. */
  private plan(
    context: RecoveryContext,
    parts: Omit<MessageRecoveryPlan, "messageId" | "framework" | "detection">,
  ): MessageRecoveryPlan {
    return {
      messageId: context.message.messageId,
      framework: this.framework,
      detection: context.detection,
      ...parts,
    };
  }

  private static abort(
    messageId: string,
    framework: ProcessingFramework,
    steps: readonly RecoveryStepResult[],
    startedAt: string,
    recoveryState: MessageRecoveryPlan["recoveryState"],
    note: string,
  ): MessageRecoveryOutcome {
    return {
      messageId,
      framework,
      status: "failed",
      recoveryState,
      steps,
      note,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Builds the operator-facing label for a queue, distinguishing the two TPM dead-letter queues from
   * each other rather than calling both "DLQ".
   */
  protected locationLabelFor(queueName: string, role: QueueRole): string {
    if (role !== "DLQ") {
      return `Active queue (${queueName})`;
    }
    const target = this.config.topology.dlqRecoveryMap[queueName];
    return target === undefined ? `Dead-letter queue (${queueName})` : `Dead-letter queue for ${target}`;
  }

  /** Convenience: probe one queue and shape the hit into a {@link LocatedMessage}. */
  protected async probe(
    context: RecoveryContext,
    queueName: string,
  ): Promise<LocatedMessage | undefined> {
    const found = await context.queue.getMessage(queueName, context.message.messageId);
    if (found === undefined) {
      return undefined;
    }
    const role: QueueRole = this.config.topology.deadLetterQueues.includes(queueName)
      ? "DLQ"
      : "MAIN";
    return {
      queueName,
      role,
      locationLabel: this.locationLabelFor(queueName, role),
      retryCount: found.retryCount,
    };
  }

  /** Walks the configured `traversalOrder`, returning the first queue the message is found on. */
  protected async traverse(context: RecoveryContext): Promise<LocatedMessage | undefined> {
    for (const queueName of this.config.topology.traversalOrder) {
      const located = await this.probe(context, queueName);
      if (located !== undefined) {
        return located;
      }
    }
    return undefined;
  }
}

/** Re-exported for strategies that build their own path arrays. */
export type { RecoveryPathStep, RecoveryValidation };
