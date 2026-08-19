import type { MessageSummary } from "../dto/MessageDto.js";
import type {
  FrameworkDetection,
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  ProcessingFramework,
} from "../dto/FrameworkDto.js";
import type { QueueEngine } from "../engines/QueueEngine.js";

/**
 * Everything a strategy needs to resolve and execute a recovery for one message, injected rather
 * than reached for — a strategy never touches the SDK, configuration files or the HTTP request.
 */
export interface RecoveryContext {
  readonly message: MessageSummary;
  readonly detection: FrameworkDetection;
  /** The message's custom headers, already read by the caller (the JMS strategy's queue lives here). */
  readonly customHeaders: Readonly<Record<string, string>>;
  /** Queue reads, moves and retries all go through this — the only tenant-facing capability a strategy has. */
  readonly queue: QueueEngine;
  /** Optional operator-supplied reason, captured in the retry audit log. */
  readonly reason: string | undefined;
  /**
   * A queue the operator explicitly chose, used only when a strategy legitimately cannot resolve one
   * itself (the JMS framework with an unparseable queue header). Never a default or a guess.
   */
  readonly operatorSelectedQueue: string | undefined;
}

/**
 * One framework's recovery behaviour (Phase 13, §2).
 *
 * The contract is deliberately narrow — resolve a plan, then execute that plan — so that
 * `RecoveryEngine` never needs to know which framework it is dealing with. Adding a framework means
 * adding a `config/frameworks.json` entry and, at most, one class here; no core file changes.
 *
 * Implementations must answer all eight things §2 requires through {@link resolve}: whether recovery
 * is supported, the message's current location, its current queue/DLQ, the recovery action, the
 * target queue, whether a move must precede the retry, the validation requirements, and a
 * human-readable explanation.
 */
export interface RecoveryStrategy {
  /** The framework this strategy handles. `ManualRecoveryStrategy` uses `UNKNOWN` as its terminal marker. */
  readonly framework: ProcessingFramework;

  /**
   * Whether this strategy handles the given detection result. The resolver asks strategies in order
   * and takes the first that says yes, so exactly one strategy ever runs per message.
   */
  supports(detection: FrameworkDetection): boolean;

  /**
   * Locates the message and works out what recovery would do — **read-only**. Nothing is moved,
   * retried or mutated here, so a plan can safely be built for a whole selection before the operator
   * confirms anything (§9).
   */
  resolve(context: RecoveryContext): Promise<MessageRecoveryPlan>;

  /**
   * Executes a previously resolved plan against the tenant, reporting each step's real outcome.
   *
   * Implementations must never infer success from an accepted request: a move that was accepted but
   * whose verification cannot find the message on the target queue has to stop and report that,
   * not proceed to retry (§7).
   */
  execute(context: RecoveryContext, plan: MessageRecoveryPlan): Promise<MessageRecoveryOutcome>;
}
