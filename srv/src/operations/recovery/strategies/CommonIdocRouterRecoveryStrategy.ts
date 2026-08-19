import type { FrameworkConfig } from "../../../config/schemas/index.js";
import type { ProcessingFramework } from "../../dto/FrameworkDto.js";
import type { RecoveryContext } from "../RecoveryStrategy.js";
import { QueueRecoveryStrategyBase, type LocatedMessage } from "../QueueRecoveryStrategyBase.js";

/**
 * Common IDoc Router recovery (Phase 13, §5).
 *
 * A two-queue topology, walked in configured order:
 *
 * ```
 * Common_Router_JMS       → found: retry the IDoc in place
 *   ↓ not found
 * Common_Router_JMS_DLQ   → found: move to Common_Router_JMS, verify, then retry
 *   ↓ not found
 * Manual investigation
 * ```
 *
 * Both queue names and the DLQ→queue mapping come from `config/frameworks.json`, so nothing here is
 * specific to the current naming. The framework ships with no *detection* rules — its real iFlow and
 * header signals are not yet confirmed — so messages reach this strategy through queue evidence
 * gathered during full detection. That is deliberate: an unmatched message is reported `UNKNOWN`
 * with evidence rather than being attributed to this framework on a hunch.
 */
export class CommonIdocRouterRecoveryStrategy extends QueueRecoveryStrategyBase {
  public readonly framework: ProcessingFramework = "COMMON_IDOC_ROUTER";

  public constructor(config: FrameworkConfig) {
    super(config);
  }

  /** @inheritdoc */
  protected async locate(context: RecoveryContext): Promise<LocatedMessage | undefined> {
    return this.traverse(context);
  }
}
