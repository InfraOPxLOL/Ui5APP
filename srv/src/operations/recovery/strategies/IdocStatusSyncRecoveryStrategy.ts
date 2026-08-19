import type { FrameworkConfig } from "../../../config/schemas/index.js";
import type { ProcessingFramework } from "../../dto/FrameworkDto.js";
import type { RecoveryContext } from "../RecoveryStrategy.js";
import { QueueRecoveryStrategyBase, type LocatedMessage } from "../QueueRecoveryStrategyBase.js";

/**
 * IDoc Status Sync recovery (Phase 13, §6) — the status/997 acknowledgement update flow.
 *
 * A two-queue topology, walked in configured order:
 *
 * ```
 * Status_JMS       → found: retry the status/997 update in place
 *   ↓ not found
 * Status_JMS_DLQ   → found: move to Status_JMS, verify, then retry
 *   ↓ not found
 * Manual investigation
 * ```
 *
 * Structurally identical to {@link module:./CommonIdocRouterRecoveryStrategy} — both are plain
 * queue/DLQ pairs — and kept as its own class purely so the two frameworks stay independently
 * configurable and independently testable. Like the router, it ships with no detection rules and is
 * reached through queue evidence during full detection until its real signals are confirmed.
 */
export class IdocStatusSyncRecoveryStrategy extends QueueRecoveryStrategyBase {
  public readonly framework: ProcessingFramework = "IDOC_STATUS_SYNC";

  public constructor(config: FrameworkConfig) {
    super(config);
  }

  /** @inheritdoc */
  protected async locate(context: RecoveryContext): Promise<LocatedMessage | undefined> {
    return this.traverse(context);
  }
}
