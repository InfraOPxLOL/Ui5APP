import type { FrameworkConfig } from "../../../config/schemas/index.js";
import type { MessageRecoveryPlan, ProcessingFramework } from "../../dto/FrameworkDto.js";
import type { RecoveryContext } from "../RecoveryStrategy.js";
import { QueueRecoveryStrategyBase, type LocatedMessage } from "../QueueRecoveryStrategyBase.js";

/**
 * JMS Framework recovery (Phase 13, §4) — the custom, in-house JMS bridge.
 *
 * Unlike the other frameworks, this one has **no static queue topology**: the egress bridge iFlow
 * resolves a message's queue at runtime and writes it into an MPL custom header, so that header is
 * the authoritative mapping. Resolution order:
 *
 * ```
 * read the configured queue header (default CH-Message-Queue)
 *   ↓ parse the queue name out of it
 * probe the resolved queue
 *   ↓ not found
 * probe the configured central DLQ
 *   ↓ not found
 * manual investigation
 * ```
 *
 * When the framework is detected but the queue **cannot** be determined — no header, or a value the
 * configured pattern cannot parse — this returns a recoverable-but-not-executable plan asking the
 * operator to select the queue, rather than guessing one. That is the §4 requirement, and the
 * project's never-fabricate rule applied to the same situation.
 *
 * The central DLQ is a shared fallback location serving every JMS queue, not a per-queue pairing, so
 * a dead-lettered message's move target is the queue its **own** header resolved to. That target
 * travels on {@link LocatedMessage.recoveryTarget} rather than being stashed on the instance: one
 * strategy instance resolves many messages concurrently when a bulk plan is built, so per-message
 * state on `this` would race.
 */
export class JmsFrameworkRecoveryStrategy extends QueueRecoveryStrategyBase {
  public readonly framework: ProcessingFramework = "JMS_FRAMEWORK";

  public constructor(config: FrameworkConfig) {
    super(config);
  }

  /** @inheritdoc */
  public async resolve(context: RecoveryContext): Promise<MessageRecoveryPlan> {
    if (this.resolveQueue(context) === undefined) {
      const headerName = this.config.queueResolution?.headerName ?? "(not configured)";
      return {
        messageId: context.message.messageId,
        framework: this.framework,
        detection: context.detection,
        supported: true,
        // Recoverable in principle, but not executable until an operator supplies the queue.
        executable: false,
        recoveryState: "MANUAL_INVESTIGATION_REQUIRED",
        action: "MANUAL",
        currentLocation: undefined,
        currentQueue: undefined,
        queueRole: "UNKNOWN",
        targetQueue: undefined,
        moveRequired: false,
        validations: [
          {
            key: "queueResolved",
            passed: false,
            message: `No "${headerName}" header was found on the JMS bridge log entry, or its value could not be parsed.`,
          },
        ],
        path: [
          { action: "MANUAL", queueName: undefined, description: "Select the queue to retry from." },
        ],
        explanation: `This message was routed through the JMS Framework, but its queue could not be resolved from the "${headerName}" header. Pick the queue manually to continue — no queue is assumed.`,
      };
    }

    return super.resolve(context);
  }

  /** @inheritdoc */
  protected async locate(context: RecoveryContext): Promise<LocatedMessage | undefined> {
    const resolved = this.resolveQueue(context);
    if (resolved === undefined) {
      return undefined;
    }

    const onResolved = await context.queue.getMessage(resolved, context.message.messageId);
    if (onResolved !== undefined) {
      return {
        queueName: resolved,
        role: "MAIN",
        locationLabel: `Active queue (${resolved})`,
        retryCount: onResolved.retryCount,
      };
    }

    const centralDlq = this.config.queueResolution?.centralDeadLetterQueue;
    if (centralDlq === undefined) {
      return undefined;
    }
    const onDlq = await context.queue.getMessage(centralDlq, context.message.messageId);
    if (onDlq === undefined) {
      return undefined;
    }
    return {
      queueName: centralDlq,
      role: "DLQ",
      locationLabel: `Dead-letter queue (${centralDlq})`,
      retryCount: onDlq.retryCount,
      // Move back to the queue this message's own header resolved to.
      recoveryTarget: resolved,
    };
  }

  /**
   * The queue for this message: parsed from the configured header, or the one the operator explicitly
   * selected when the header could not be parsed. Never a default.
   */
  private resolveQueue(context: RecoveryContext): string | undefined {
    return this.parseQueueFromHeaders(context.customHeaders) ?? context.operatorSelectedQueue;
  }

  /**
   * Extracts the queue name from the configured header. The real value is decorated, e.g.
   * `📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]`
   * — the configured pattern's first capture group is the bare name. Header lookup is
   * case-insensitive; CPI is inconsistent about casing.
   */
  private parseQueueFromHeaders(headers: Readonly<Record<string, string>>): string | undefined {
    const resolution = this.config.queueResolution;
    if (resolution === undefined) {
      return undefined;
    }
    const entry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === resolution.headerName.toLowerCase(),
    );
    if (entry === undefined) {
      return undefined;
    }
    const match = new RegExp(resolution.headerValuePattern).exec(entry[1].trim());
    const captured = match?.[1]?.trim();
    return captured === undefined || captured === "" ? undefined : captured;
  }
}
