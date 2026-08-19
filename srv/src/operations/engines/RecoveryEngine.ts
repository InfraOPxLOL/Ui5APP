import type { JmsClient } from "../../sdk/client/JmsClient.js";
import type { QueueConfig } from "../../config/schemas/index.js";
import type { QueuedMessage } from "../../core/providers/types.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { UpstreamError } from "../../core/errors/UpstreamError.js";
import type {
  ConsumerStatus,
  DlqOverviewEntry,
  QueueHealthSummary,
  RecoveryCandidate,
  RecoveryDashboardSummary,
  RecoveryHistoryEntry,
  RecoveryPreview,
  RecoveryRequest,
  RecoveryResult,
  RecoveryStatistics,
  RecoveryValidationCheck,
  RecoveryValidationResult,
} from "../dto/RecoveryDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import type { MessageSummary } from "../dto/MessageDto.js";
import type {
  FrameworkDetection,
  MessageRecoveryOutcome,
  MessageRecoveryPlan,
  RecoveryPlanBatch,
} from "../dto/FrameworkDto.js";
import type { QueueEngine } from "./QueueEngine.js";
import type { RuntimeEngine } from "./RuntimeEngine.js";
import type { RecoveryStrategy } from "../recovery/RecoveryStrategy.js";
import type { RecoveryStrategyResolver } from "../recovery/RecoveryStrategyResolver.js";
import { recoveryLockStore, RecoveryLockStore } from "../recovery/RecoveryLockStore.js";
import { OperationsCache } from "../cache/index.js";
import { calculateDurationMs, clampUtilization } from "../transform/index.js";
import { recoveryStateStore, RecoveryStateStore } from "./RecoveryStateStore.js";

/** Everything the message-scoped recovery API needs about one message, supplied by the caller. */
export interface MessageRecoveryInput {
  readonly message: MessageSummary;
  readonly detection: FrameworkDetection;
  readonly customHeaders: Readonly<Record<string, string>>;
  /** Optional operator-supplied reason, captured in the retry audit log. */
  readonly reason?: string;
  /** A queue the operator explicitly chose, for the one case a strategy legitimately cannot resolve one. */
  readonly operatorSelectedQueue?: string;
}

/** How many messages of a queue's parked backlog are sampled when computing "oldest message age". */
const OLDEST_MESSAGE_SAMPLE_SIZE = 50;
/** Heuristic throughput estimate (no historical timing data exists yet — an honest estimate). */
const ESTIMATED_MS_PER_MESSAGE = 250;
const MIN_ESTIMATED_DURATION_MS = 500;
/** Batches above this size get an explicit preview warning, independent of validation outcome. */
const LARGE_BATCH_WARNING_THRESHOLD = 500;
/** Ceiling on how many parked messages one `executeRecovery("all")` call will attempt. */
const MAX_RECOVER_ALL_MESSAGES = 1000;

function newRecoveryId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Prepares Recovery Center information (architecture: Phase 11, Recovery Engine). Composes
 * `QueueEngine` (queue topology + live state), `JmsClient` (message-level operations — `listMessages`/
 * `retryMessage`) and `RuntimeEngine` (runtime availability) into the Recovery Center's own DTOs.
 * Never touches `config/*.json` directly; `queueConfigs` is injected by the composition root exactly
 * like `QueueEngine`'s own topology metadata.
 *
 * "Queue mapping" reuses `config/queues.json`'s existing `deadLetterQueue`/`retryQueue` fields — no
 * new configuration concept, and no queue name is ever hardcoded here. A dead-letter/retry queue with
 * no matching `config/queues.json` entry has no resolvable destination, which the validation and
 * preview surfaces both report honestly (`queueMappingExists: false`) rather than guessing one.
 *
 * ## Two distinct recovery surfaces
 *
 * Since Phase 13 this engine exposes two independent APIs that deliberately do **not** share code:
 *
 * - **Queue-batch recovery** (Phase 11, unchanged) — `getDashboard`/`listCandidates`/
 *   `validateRecovery`/`previewRecovery`/`executeRecovery`/`getHistory`. Operates on a whole
 *   dead-letter queue at a time and is what the Recovery Center workspace drives.
 * - **Message-scoped, framework-aware recovery** (Phase 13) — {@link resolveMessageStrategy},
 *   {@link buildRecoveryPlan}, {@link executeMessageRecovery}. Operates on one specific message,
 *   delegating everything framework-specific to a {@link RecoveryStrategy} chosen by the injected
 *   {@link RecoveryStrategyResolver}.
 *
 * **No framework logic lives in this class.** It never branches on which framework a message belongs
 * to — it asks the resolver for a strategy and calls it. Adding a framework is a
 * `config/frameworks.json` entry plus a strategy class; this file does not change.
 */
export class RecoveryEngine {
  public constructor(
    private readonly queue: QueueEngine,
    private readonly client: JmsClient,
    private readonly runtime: RuntimeEngine,
    private readonly queueConfigs: readonly QueueConfig[],
    private readonly cache: OperationsCache,
    private readonly stateStore: RecoveryStateStore = recoveryStateStore,
    /** Absent only in older tests that exercise the queue-batch API alone. */
    private readonly strategyResolver?: RecoveryStrategyResolver,
    private readonly lockStore: RecoveryLockStore = recoveryLockStore,
  ) {}

  // --- Message-scoped, framework-aware recovery (Phase 13) ----------------------

  /**
   * Picks the strategy that will handle a message, based on its framework detection result.
   * @param detection the framework detection result.
   * @returns the matching strategy.
   * @throws {Error} when the engine was constructed without a resolver.
   */
  public resolveMessageStrategy(detection: FrameworkDetection): RecoveryStrategy {
    if (this.strategyResolver === undefined) {
      throw new Error(
        "RecoveryEngine was constructed without a RecoveryStrategyResolver — message-scoped recovery is unavailable.",
      );
    }
    return this.strategyResolver.resolve(detection);
  }

  /**
   * Resolves what recovery *would* do for one message, without touching anything (§9's pre-execution
   * step). Read-only: safe to call for a whole selection before the operator confirms.
   *
   * A recovery already in flight for this message is surfaced as `RETRYING`/non-executable, so a
   * plan never invites a duplicate of an operation that is currently running.
   *
   * @param input the message, its detection result and its headers.
   * @returns the resolved plan.
   */
  public async resolveRecoveryPlan(input: MessageRecoveryInput): Promise<MessageRecoveryPlan> {
    const strategy = this.resolveMessageStrategy(input.detection);
    const plan = await strategy.resolve(this.toContext(input));
    if (!this.lockStore.isInFlight(input.message.messageId)) {
      return plan;
    }
    return {
      ...plan,
      executable: false,
      recoveryState: "RETRYING",
      explanation: `A recovery for this message is already in progress. ${plan.explanation}`,
    };
  }

  /**
   * Builds a recovery plan for a selection of messages (§9), splitting executable from
   * non-executable so the confirmation dialog can show every message but run only the ones that can
   * genuinely proceed.
   *
   * @param inputs one entry per selected message.
   * @returns the batch plan.
   */
  public async buildRecoveryPlan(
    inputs: readonly MessageRecoveryInput[],
  ): Promise<RecoveryPlanBatch> {
    const plans = await Promise.all(inputs.map((input) => this.resolveRecoveryPlan(input)));
    const executableMessageIds = plans
      .filter((plan) => plan.executable)
      .map((plan) => plan.messageId);
    return {
      plans,
      executableMessageIds,
      executableCount: executableMessageIds.length,
      excludedCount: plans.length - executableMessageIds.length,
    };
  }

  /**
   * Executes recovery for one message: claims it, re-resolves the plan against live state, then runs
   * the strategy's move → verify → retry sequence.
   *
   * The plan is deliberately re-resolved here rather than accepted from the caller — a plan built for
   * a confirmation dialog may be seconds or minutes old, and the message may have moved, been
   * retried by someone else, or drained in the meantime. Acting on a stale plan is exactly how a
   * "successful" recovery of a message that was no longer there would be reported.
   *
   * The lock is claimed **before** any tenant call and released in a `finally`, so a crash mid-flight
   * cannot leave a message permanently blocked (see {@link RecoveryLockStore}'s staleness handling).
   *
   * @param input the message, its detection result and its headers.
   * @returns the real outcome, including every step that ran.
   */
  public async executeMessageRecovery(
    input: MessageRecoveryInput,
  ): Promise<MessageRecoveryOutcome> {
    const messageId = input.message.messageId;
    const startedAt = new Date().toISOString();
    const claim = this.lockStore.tryAcquire(messageId);

    if (claim.kind === "in-flight") {
      return {
        messageId,
        framework: input.detection.framework,
        status: "unavailable",
        recoveryState: "RETRYING",
        steps: [],
        note: `A recovery for this message has been running since ${claim.sinceIso}. No second attempt was made.`,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }
    if (claim.kind === "already-processed") {
      return {
        messageId,
        framework: input.detection.framework,
        status: "already-processed",
        recoveryState: "COMPLETED",
        steps: [],
        note: `This message was already recovered at ${claim.atIso}. ${claim.note}`,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    try {
      const strategy = this.resolveMessageStrategy(input.detection);
      const context = this.toContext(input);
      const plan = await strategy.resolve(context);
      const outcome = await strategy.execute(context, plan);
      // Only remember attempts that genuinely reached the tenant. A plan that was never executable
      // must stay immediately retryable once the operator fixes whatever blocked it.
      this.lockStore.release(
        messageId,
        outcome.status === "accepted" || outcome.status === "successful"
          ? outcome.note
          : undefined,
      );
      return outcome;
    } catch (error) {
      this.lockStore.release(messageId);
      throw error;
    }
  }

  private toContext(input: MessageRecoveryInput) {
    return {
      message: input.message,
      detection: input.detection,
      customHeaders: input.customHeaders,
      queue: this.queue,
      reason: input.reason,
      operatorSelectedQueue: input.operatorSelectedQueue,
    };
  }

  /** Composes the single aggregated view the Recovery Dashboard renders. */
  public async getDashboard(): Promise<RecoveryDashboardSummary> {
    const [candidates, queueHealth, dlqOverview, statistics] = await Promise.all([
      this.listCandidates(),
      this.getQueueHealth(),
      this.getDlqOverview(),
      this.getStatistics(),
    ]);
    return {
      candidates,
      queueHealth,
      dlqOverview,
      statistics,
      recentRecoveries: this.stateStore.listHistory().slice(0, 10),
    };
  }

  /** Lists every recoverable batch: dead-letter/retry queues that currently hold parked messages. */
  public async listCandidates(): Promise<readonly RecoveryCandidate[]> {
    return this.cache.dedupe("recovery.candidates", async () => {
      const configs = this.queueConfigs.filter((config) => config.enabled);
      const recoveryQueueNames = configs.flatMap((config) => [
        config.deadLetterQueue,
        config.retryQueue,
      ]);
      if (recoveryQueueNames.length === 0) {
        return [];
      }
      const [recoveryStates, destinationSummaries] = await Promise.all([
        this.client.getQueueStates(recoveryQueueNames),
        this.queue.listQueues(),
      ]);
      const recoveryByName = new Map(recoveryStates.map((state) => [state.queueName, state]));
      const destinationByName = new Map(destinationSummaries.map((s) => [s.queueName, s]));

      const candidates: RecoveryCandidate[] = [];
      for (const config of configs) {
        const destinationConsumerActive =
          (destinationByName.get(config.name)?.consumerCount ?? 0) > 0;
        const pairings: ReadonlyArray<readonly [string, string]> = [
          [config.deadLetterQueue, "Dead Letter"],
          [config.retryQueue, "Retry"],
        ];
        for (const [recoveryQueue, kind] of pairings) {
          const state = recoveryByName.get(recoveryQueue);
          if (state === undefined || state.messageCount === 0) {
            continue;
          }
          this.stateStore.recordSample(recoveryQueue, state.messageCount);
          candidates.push({
            queueName: recoveryQueue,
            displayName: `${config.displayName} — ${kind}`,
            sourceQueue: config.name,
            messageCount: state.messageCount,
            oldestMessageAgeMs: await this.oldestMessageAgeMs(recoveryQueue),
            priority: config.priority,
            readiness: destinationConsumerActive ? "ready" : "blocked",
            blockedReason: destinationConsumerActive
              ? undefined
              : `No active consumer on destination queue "${config.name}".`,
            retryStrategy: config.retryStrategy,
            maxRetries: config.maxRetries,
          });
        }
      }
      return candidates.sort((a, b) => a.priority - b.priority);
    });
  }

  /** Composite health view of every configured processing queue. */
  public async getQueueHealth(): Promise<readonly QueueHealthSummary[]> {
    return this.cache.dedupe("recovery.queueHealth", async () => {
      const summaries = await this.queue.listQueues();
      return Promise.all(
        summaries.map(async (summary) => {
          this.stateStore.recordSample(summary.queueName, summary.messageCount);
          const { oldestMs, newestMs } = await this.messageAgeRange(summary.queueName);
          const consumerStatus: ConsumerStatus = summary.consumerCount > 0 ? "active" : "inactive";
          const healthScore = RecoveryEngine.computeHealthScore(
            summary.capacityUsedPct,
            consumerStatus,
            oldestMs,
          );
          return {
            queueName: summary.queueName,
            displayName: summary.displayName,
            messageCount: summary.messageCount,
            healthScore,
            growthTrend: this.stateStore.growthTrend(summary.queueName),
            consumerStatus,
            oldestMessageAgeMs: oldestMs,
            newestMessageAgeMs: newestMs,
            recoveryReadiness: healthScore >= 50 ? "ready" : "blocked",
          } satisfies QueueHealthSummary;
        }),
      );
    });
  }

  /** One overview entry per configured dead-letter queue. */
  public async getDlqOverview(): Promise<readonly DlqOverviewEntry[]> {
    return this.cache.dedupe("recovery.dlqOverview", async () => {
      const configs = this.queueConfigs.filter((config) => config.enabled);
      if (configs.length === 0) {
        return [];
      }
      const states = await this.client.getQueueStates(
        configs.map((config) => config.deadLetterQueue),
      );
      const statesByName = new Map(states.map((state) => [state.queueName, state]));
      const entries: DlqOverviewEntry[] = [];
      for (const config of configs) {
        entries.push({
          dlqName: config.deadLetterQueue,
          sourceQueue: config.name,
          messageCount: statesByName.get(config.deadLetterQueue)?.messageCount ?? 0,
          oldestMessageAgeMs: await this.oldestMessageAgeMs(config.deadLetterQueue),
        });
      }
      return entries;
    });
  }

  /** Aggregate statistics derived from session-only recovery history. */
  public async getStatistics(): Promise<RecoveryStatistics> {
    const history = this.stateStore.listHistory();
    const totalRecoveries = history.length;
    const successfulRecoveries = history.filter((h) => h.status === "completed").length;
    const failedRecoveries = history.filter((h) => h.status === "failed").length;
    const successRatePct =
      totalRecoveries === 0 ? 0 : Math.round((successfulRecoveries / totalRecoveries) * 100);
    const durations = history.map((h) => h.durationMs).filter((d): d is number => d !== undefined);
    const averageDurationMs =
      durations.length === 0
        ? 0
        : Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
    const dayAgo = Date.now() - 86_400_000;
    const messagesRecoveredLast24h = history
      .filter((h) => new Date(h.startTime).getTime() >= dayAgo)
      .reduce((sum, h) => sum + h.messagesRecovered, 0);
    return {
      totalRecoveries,
      successfulRecoveries,
      failedRecoveries,
      successRatePct,
      averageDurationMs,
      messagesRecoveredLast24h,
    };
  }

  /**
   * Runs every recovery validation check for a prospective recovery from `sourceQueue`.
   * @param sourceQueue the dead-letter/retry queue to recover from.
   * @param callerHasOperatorScope whether the caller holds the retry-operator permission
   *   (`PI_RETRY_OPERATOR`) — resolved by the caller (HTTP layer) from the request's security
   *   context; the engine has no access to the request itself.
   * @returns every check plus the overall pass/fail outcome.
   */
  public async validateRecovery(
    sourceQueue: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryValidationResult> {
    const destinationQueue = this.resolveDestination(sourceQueue);
    const [sourceStates, destinationStates, artifacts] = await Promise.all([
      this.client.getQueueStates([sourceQueue]),
      destinationQueue === undefined
        ? Promise.resolve([])
        : this.client.getQueueStates([destinationQueue]),
      this.runtime.listArtifacts(),
    ]);
    const sourceState = sourceStates[0];
    const destinationState = destinationStates[0];
    const destinationConsumerActive = (destinationState?.consumerCount ?? 0) > 0;
    // No queue-to-integration-flow mapping exists in this domain model, so "runtime available" is
    // necessarily a general reachability check, not a check of the one flow that feeds this queue.
    const runtimeAvailable = artifacts.some((artifact) => artifact.health !== "critical");

    const checks: RecoveryValidationCheck[] = [
      {
        key: "queueExists",
        passed: sourceState !== undefined,
        message:
          sourceState !== undefined
            ? `Source queue "${sourceQueue}" exists.`
            : `Source queue "${sourceQueue}" was not found on the tenant.`,
      },
      {
        key: "queueMappingExists",
        passed: destinationQueue !== undefined,
        message:
          destinationQueue !== undefined
            ? `Mapped to destination queue "${destinationQueue}" via config/queues.json.`
            : `No queue in config/queues.json declares "${sourceQueue}" as its dead-letter or retry queue.`,
      },
      {
        key: "targetQueueReachable",
        passed: destinationState !== undefined,
        message:
          destinationState !== undefined
            ? `Destination queue "${destinationQueue}" is reachable.`
            : "The destination queue could not be reached on the tenant.",
      },
      {
        key: "consumerActive",
        passed: destinationConsumerActive,
        message: destinationConsumerActive
          ? "An active consumer is attached to the destination queue."
          : "No active consumer is attached to the destination queue.",
      },
      {
        key: "runtimeAvailable",
        passed: runtimeAvailable,
        message: runtimeAvailable
          ? "Integration runtime is reachable."
          : "No healthy runtime artifact was found.",
      },
      {
        key: "userPermission",
        passed: callerHasOperatorScope,
        message: callerHasOperatorScope
          ? "The caller holds the retry-operator permission."
          : "The caller does not hold the retry-operator permission (PI_RETRY_OPERATOR).",
      },
    ];
    return { checks, passed: checks.every((check) => check.passed) };
  }

  /** Composes the full preview (validation + impact analysis) shown before a recovery is confirmed. */
  public async previewRecovery(
    sourceQueue: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryPreview> {
    const [validation, sourceStates] = await Promise.all([
      this.validateRecovery(sourceQueue, callerHasOperatorScope),
      this.client.getQueueStates([sourceQueue]),
    ]);
    const destinationQueue = this.resolveDestination(sourceQueue) ?? sourceQueue;
    const messageCount = sourceStates[0]?.messageCount ?? 0;
    const estimatedDurationMs = Math.max(
      MIN_ESTIMATED_DURATION_MS,
      messageCount * ESTIMATED_MS_PER_MESSAGE,
    );
    const warnings: string[] = [];
    if (messageCount > LARGE_BATCH_WARNING_THRESHOLD) {
      warnings.push(`Recovering ${messageCount} messages is a large batch and may take a while.`);
    }
    if (!validation.passed) {
      warnings.push("One or more validation checks failed; recovery is disabled until resolved.");
    }
    return {
      sourceQueue,
      destinationQueue,
      messageCount,
      estimatedDurationMs,
      validation,
      warnings,
      impact: { affectedQueue: destinationQueue, messageCount, estimatedDurationMs, warnings },
      confirmationRequired: true,
    };
  }

  /**
   * Executes (or dry-run simulates) a recovery. Blocked entirely when validation fails — the caller
   * must resolve the failing checks (or the operator must re-preview) before this returns anything
   * other than a `"failed"` result recording why.
   * @param request the recovery request (`messageIds` omitted ⇒ recover every parked message, bounded
   *   by {@link MAX_RECOVER_ALL_MESSAGES}).
   * @param callerHasOperatorScope whether the caller holds the retry-operator permission.
   * @returns the recovery outcome, also appended to Recovery History.
   */
  public async executeRecovery(
    request: RecoveryRequest,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryResult> {
    const recoveryId = newRecoveryId();
    const startTime = new Date().toISOString();
    const destinationQueue = this.resolveDestination(request.sourceQueue) ?? request.sourceQueue;
    const dryRun = request.dryRun ?? false;

    const validation = await this.validateRecovery(request.sourceQueue, callerHasOperatorScope);
    if (!validation.passed) {
      return this.finalize({
        recoveryId,
        sourceQueue: request.sourceQueue,
        destinationQueue,
        status: "failed",
        startTime,
        endTime: startTime,
        durationMs: 0,
        operator: request.operator,
        dryRun,
        messagesRequested: 0,
        messagesRecovered: 0,
        messagesFailed: 0,
        result: `Validation failed: ${validation.checks
          .filter((check) => !check.passed)
          .map((check) => check.message)
          .join(" ")}`,
      });
    }

    const targetIds = await this.resolveTargetMessageIds(request);
    if (dryRun) {
      return this.finalize({
        recoveryId,
        sourceQueue: request.sourceQueue,
        destinationQueue,
        status: "completed",
        startTime,
        endTime: new Date().toISOString(),
        durationMs: calculateDurationMs(startTime, new Date().toISOString()),
        operator: request.operator,
        dryRun: true,
        messagesRequested: targetIds.length,
        messagesRecovered: 0,
        messagesFailed: 0,
        result: `Dry run: ${targetIds.length} message(s) would be recovered. No message was retried.`,
      });
    }

    let recovered = 0;
    let failed = 0;
    for (const messageId of targetIds) {
      try {
        const outcome = await this.client.retryMessage({
          messageId,
          queueName: request.sourceQueue,
          reason: request.reason,
        });
        if (outcome.accepted) {
          recovered += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    const endTime = new Date().toISOString();
    return this.finalize({
      recoveryId,
      sourceQueue: request.sourceQueue,
      destinationQueue,
      status: recovered > 0 || targetIds.length === 0 ? "completed" : "failed",
      startTime,
      endTime,
      durationMs: calculateDurationMs(startTime, endTime),
      operator: request.operator,
      dryRun: false,
      messagesRequested: targetIds.length,
      messagesRecovered: recovered,
      messagesFailed: failed,
      result: `Recovered ${recovered} of ${targetIds.length} message(s)${failed > 0 ? `; ${failed} failed` : ""}.`,
    });
  }

  /**
   * Marks a recorded recovery as cancelled. Recovery execution in this codebase runs synchronously
   * within one request (no async job runner exists yet — architecture: Phase 11, a documented seam
   * for a future phase), so this can only cancel an entry that a concurrent caller recorded as
   * `"running"` but that hasn't been finalized yet; it cannot interrupt a batch already in flight
   * inside another `executeRecovery` call.
   * @param recoveryId the recovery to cancel.
   * @returns the updated entry, or `undefined` when unknown or already finalized.
   */
  public cancelRecovery(recoveryId: string): RecoveryHistoryEntry | undefined {
    const entry = this.stateStore.findHistory(recoveryId);
    if (entry === undefined || entry.status !== "running") {
      return undefined;
    }
    return this.stateStore.updateHistory(recoveryId, {
      ...entry,
      status: "cancelled",
      endTime: new Date().toISOString(),
    });
  }

  /**
   * Retries a previously failed or cancelled recovery, re-running the same source queue/message
   * selection as a brand-new recovery attempt.
   * @param recoveryId the recovery to retry.
   * @param callerHasOperatorScope whether the caller holds the retry-operator permission.
   * @returns the new recovery outcome, or `undefined` when `recoveryId` is unknown or still running.
   */
  public async retryRecovery(
    recoveryId: string,
    callerHasOperatorScope: boolean,
  ): Promise<RecoveryResult | undefined> {
    const original = this.stateStore.findHistory(recoveryId);
    if (original === undefined || original.status === "running") {
      return undefined;
    }
    return this.executeRecovery(
      {
        sourceQueue: original.sourceQueue,
        dryRun: original.dryRun,
        operator: original.operator,
        reason: `Retry of recovery ${recoveryId}`,
      },
      callerHasOperatorScope,
    );
  }

  /** Lists Recovery History, most recent first (session-only — see {@link RecoveryStateStore}). */
  public getHistory(page: {
    readonly skip: number;
    readonly top: number;
  }): SearchResult<RecoveryHistoryEntry> {
    const all = this.stateStore.listHistory();
    return { items: all.slice(page.skip, page.skip + page.top), total: all.length, tookMs: 0 };
  }

  // -----------------------------------------------------------------------------------------------

  private finalize(result: RecoveryResult): RecoveryResult {
    this.stateStore.recordHistory({
      recoveryId: result.recoveryId,
      sourceQueue: result.sourceQueue,
      destinationQueue: result.destinationQueue,
      startTime: result.startTime,
      endTime: result.endTime,
      durationMs: result.durationMs,
      status: result.status,
      operator: result.operator,
      dryRun: result.dryRun,
      messagesRequested: result.messagesRequested,
      messagesRecovered: result.messagesRecovered,
      messagesFailed: result.messagesFailed,
      result: result.result,
    });
    return result;
  }

  private async resolveTargetMessageIds(request: RecoveryRequest): Promise<readonly string[]> {
    if (request.messageIds !== undefined) {
      return request.messageIds;
    }
    const page = await this.client.listMessages(request.sourceQueue, {
      skip: 0,
      top: MAX_RECOVER_ALL_MESSAGES,
    });
    return page.items.map((message) => message.messageId);
  }

  private resolveDestination(sourceQueue: string): string | undefined {
    return this.queueConfigs.find(
      (config) => config.deadLetterQueue === sourceQueue || config.retryQueue === sourceQueue,
    )?.name;
  }

  /**
   * Whether an error means "this queue does not exist on the tenant": a 404, or the 400 the JMS
   * OData API raises when it rejects a queue name outright (only `[A-Za-z0-9_]{1,80}` is accepted,
   * so a configured placeholder like `ORDERS_Q.DLQ` can never exist there).
   */
  private static isUnknownQueueError(error: unknown): boolean {
    if (error instanceof HttpError) {
      return error.statusCode === 404;
    }
    if (error instanceof UpstreamError) {
      return error.upstreamStatus === 404 || error.upstreamStatus === 400;
    }
    return false;
  }

  /** Convenience wrapper over {@link messageAgeRange} for call sites that only need the oldest age. */
  private async oldestMessageAgeMs(queueName: string): Promise<number | undefined> {
    return (await this.messageAgeRange(queueName)).oldestMs;
  }

  /**
   * Best-effort oldest/newest parked message age: reads the first page (not the whole queue — a
   * queue may hold far more than this) and takes the min/max `enqueuedAt` within it. Accurate
   * whenever a queue's backlog fits within one page; on a larger backlog this reports the
   * oldest/newest message *seen*, not necessarily the true oldest/newest, since neither provider
   * guarantees chronological page ordering.
   *
   * A queue the tenant does not know (404) or whose configured name it rejects outright (400 —
   * the JMS OData API only accepts `[A-Za-z0-9_]{1,80}` queue names) has no listable messages:
   * `config/queues.json` describes the *intended* topology, the tenant the actual one, so a
   * configured-but-absent queue is an expected state that degrades to "no age data" rather than
   * failing the whole Recovery workspace. Every other failure still propagates.
   */
  private async messageAgeRange(
    queueName: string,
  ): Promise<{ oldestMs: number | undefined; newestMs: number | undefined }> {
    let page: Awaited<ReturnType<JmsClient["listMessages"]>>;
    try {
      page = await this.client.listMessages(queueName, {
        skip: 0,
        top: OLDEST_MESSAGE_SAMPLE_SIZE,
      });
    } catch (error) {
      if (RecoveryEngine.isUnknownQueueError(error)) {
        return { oldestMs: undefined, newestMs: undefined };
      }
      throw error;
    }
    if (page.items.length === 0) {
      return { oldestMs: undefined, newestMs: undefined };
    }
    const oldest = page.items.reduce((min: QueuedMessage, message: QueuedMessage) =>
      new Date(message.enqueuedAt).getTime() < new Date(min.enqueuedAt).getTime() ? message : min,
    );
    const newest = page.items.reduce((max: QueuedMessage, message: QueuedMessage) =>
      new Date(message.enqueuedAt).getTime() > new Date(max.enqueuedAt).getTime() ? message : max,
    );
    const now = Date.now();
    return {
      oldestMs: now - new Date(oldest.enqueuedAt).getTime(),
      newestMs: now - new Date(newest.enqueuedAt).getTime(),
    };
  }

  /**
   * Composite 0–100 health score: capacity headroom, penalized when no consumer is attached or the
   * oldest parked message is over an hour old. No historical baseline exists to calibrate a more
   * precise model against — a documented heuristic, not a measured value.
   */
  private static computeHealthScore(
    capacityUsedPct: number,
    consumerStatus: ConsumerStatus,
    oldestMessageAgeMs: number | undefined,
  ): number {
    let score = 100 - clampUtilization(capacityUsedPct);
    if (consumerStatus === "inactive") {
      score -= 30;
    }
    if (oldestMessageAgeMs !== undefined && oldestMessageAgeMs > 3_600_000) {
      score -= 20;
    }
    return Math.max(0, Math.min(100, score));
  }
}
