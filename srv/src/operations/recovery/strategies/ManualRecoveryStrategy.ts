import type {
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  ProcessingFramework,
} from "../../dto/FrameworkDto.js";
import type { RecoveryContext, RecoveryStrategy } from "../RecoveryStrategy.js";

/**
 * The terminal fallback strategy (Phase 13, §2) — used when no framework owns a message, or none
 * could be determined with enough evidence.
 *
 * It executes nothing. Its job is to give the operator an honest, actionable answer instead of a
 * silent dead end: the detection evidence trail is carried straight through into the plan, so the UI
 * can show *why* no framework matched rather than just "Unknown".
 *
 * `supports` returns `true` unconditionally, so the resolver can register it last and always have a
 * strategy to fall back on — no message is ever left unhandled.
 */
export class ManualRecoveryStrategy implements RecoveryStrategy {
  /** Not a real framework — the marker for "no strategy claimed this message". */
  public readonly framework: ProcessingFramework = "UNKNOWN";

  /** @inheritdoc */
  public supports(): boolean {
    return true;
  }

  /** @inheritdoc */
  public async resolve(context: RecoveryContext): Promise<MessageRecoveryPlan> {
    const detection = context.detection;
    const isNonFramework = detection.framework === "NON_FRAMEWORK";

    return {
      messageId: context.message.messageId,
      framework: detection.framework,
      detection,
      supported: false,
      executable: false,
      recoveryState: isNonFramework ? "UNSUPPORTED" : "MANUAL_INVESTIGATION_REQUIRED",
      action: "MANUAL",
      currentLocation: undefined,
      currentQueue: undefined,
      queueRole: "NONE",
      targetQueue: undefined,
      moveRequired: false,
      validations: [
        {
          key: "frameworkDetected",
          passed: false,
          message: isNonFramework
            ? "This message is not processed by any framework that supports automated recovery."
            : "No processing framework could be determined for this message.",
        },
      ],
      path: [
        {
          action: "MANUAL",
          queueName: undefined,
          description: isNonFramework
            ? "No framework recovery available — investigate manually."
            : "Framework undetermined — investigate manually.",
        },
      ],
      explanation: isNonFramework
        ? "No processing framework was detected for this message, so there is no queue topology to recover it through. Investigate it manually."
        : `The processing framework for this message could not be determined, so no recovery path can be offered. See the detection evidence for which rules were evaluated and why none matched.`,
    };
  }

  /**
   * @inheritdoc
   *
   * Always `unavailable` — this strategy never touches the tenant. Reaching here means a caller
   * tried to execute a plan whose `executable` flag is `false`, which the backend refuses rather
   * than attempting a best-effort action against an unknown topology.
   */
  public async execute(
    context: RecoveryContext,
    plan: MessageRecoveryPlan,
  ): Promise<MessageRecoveryOutcome> {
    const now = new Date().toISOString();
    return {
      messageId: context.message.messageId,
      framework: plan.framework,
      status: "unavailable",
      recoveryState: plan.recoveryState,
      steps: [],
      note: plan.explanation,
      startedAt: now,
      finishedAt: now,
    };
  }
}
