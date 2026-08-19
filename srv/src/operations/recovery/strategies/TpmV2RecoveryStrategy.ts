import type { FrameworkConfig } from "../../../config/schemas/index.js";
import type { ProcessingFramework } from "../../dto/FrameworkDto.js";
import type { RecoveryContext } from "../RecoveryStrategy.js";
import { QueueRecoveryStrategyBase, type LocatedMessage } from "../QueueRecoveryStrategyBase.js";

/**
 * TPM V2 recovery (Phase 13, §3) — SAP's own Trading Partner Management framework.
 *
 * Locating a message is a deterministic walk down the configured `traversalOrder`, stopping at the
 * first queue that actually holds it:
 *
 * ```
 * SAP_TPM_INBOUND_Q
 *   ↓ not found
 * SAP_TPM_OUTBOUND_Q
 *   ↓ not found
 * SAP_TPM_COM_PROCESSING_OUTBOUND_DEAD_LETTER_Q
 *   ↓ not found
 * SAP_TPM_COM_RECEIVER_OUTOUND_DEAD_LETTER_Q
 *   ↓ not found
 * Manual investigation
 * ```
 *
 * The two dead-letter queues recover to *different* targets — processing → inbound, receiver →
 * outbound — which is exactly what `topology.dlqRecoveryMap` encodes, so the base class's generic
 * move → verify → retry needs no TPM-specific code. A message found on either active queue is
 * validated and retried in place.
 *
 * Every queue name comes from `config/frameworks.json`; none is hardcoded here, so a tenant whose
 * TPM queues are named differently is a configuration edit.
 */
export class TpmV2RecoveryStrategy extends QueueRecoveryStrategyBase {
  public readonly framework: ProcessingFramework = "TPM_V2";

  public constructor(config: FrameworkConfig) {
    super(config);
  }

  /** @inheritdoc */
  protected async locate(context: RecoveryContext): Promise<LocatedMessage | undefined> {
    return this.traverse(context);
  }
}
