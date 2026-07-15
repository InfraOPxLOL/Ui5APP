import type { JmsClient } from "../../sdk/client/JmsClient.js";
import type { RetryResponseDto } from "../../sdk/dto/RetryDto.js";
import type { QueueConfig } from "../../config/schemas/index.js";
import type { QueueDiscoveryMode } from "../../config/env.js";
import type { ProviderPage, QueueRuntimeInfo, QueuedMessage } from "../../core/providers/types.js";
import type { QueueSummary, QueuedMessageSummary } from "../dto/QueueDto.js";
import type { SearchResult } from "../dto/SearchDto.js";
import { OperationsCache } from "../cache/index.js";
import { clampUtilization, formatBytesHuman, queueHealth } from "../transform/index.js";

/**
 * Prepares JMS queue information (architecture: Phase 6, Queue Engine, §9). Merges live runtime
 * state (`sdk.jms`) with static topology metadata (`config/queues.json`, injected as
 * `queueConfigs` — the Operations Engine's composition root reads `ConfigService.getQueues()`; this
 * engine itself never reads configuration files) into a single {@link QueueSummary} per queue. No
 * retry execution here (Phase 6 scope) — message retry lives on `JmsClient.retryMessage`, consumed
 * by the Recovery Engine (Phase 11).
 *
 * `discoveryMode` (`JMS_QUEUE_DISCOVERY_MODE`, resolved by the composition root) selects how
 * `listQueues` decides which queues exist:
 * - `Fetch_Specific` (default) — only the enabled queues in `queueConfigs` are checked, exactly as
 *   before.
 * - `Fetch_All` — `queueConfigs` (including `enabled`) is bypassed entirely; every queue the tenant
 *   itself reports (`client.discoverQueues()`) is returned, using `queueConfigs` only as an optional
 *   metadata overlay by name match. A discovered queue with no matching config entry gets honest
 *   defaults (its own name as display name, no dead-letter/retry pairing, lowest priority).
 */
export class QueueEngine {
  public constructor(
    private readonly client: JmsClient,
    private readonly queueConfigs: readonly QueueConfig[],
    private readonly cache: OperationsCache,
    private readonly discoveryMode: QueueDiscoveryMode = "Fetch_Specific",
  ) {}

  /**
   * Lists every queue's summary (topology metadata merged with live runtime state). Which queues
   * are considered depends on {@link discoveryMode}.
   */
  public async listQueues(): Promise<readonly QueueSummary[]> {
    return this.cache.dedupe("queue.list", async () => {
      if (this.discoveryMode === "Fetch_All") {
        const discovered = await this.client.discoverQueues();
        const configByName = new Map(this.queueConfigs.map((config) => [config.name, config]));
        return discovered.map((state) =>
          QueueEngine.toSummary(state.queueName, configByName.get(state.queueName), state),
        );
      }
      const enabled = this.queueConfigs.filter((config) => config.enabled);
      const states = await this.client.getQueueStates(enabled.map((config) => config.name));
      const statesByName = new Map(states.map((state) => [state.queueName, state]));
      return enabled.map((config) =>
        QueueEngine.toSummary(config.name, config, statesByName.get(config.name)),
      );
    });
  }

  /**
   * Reads one queue's summary by name.
   * @param queueName the physical queue name.
   * @returns the queue summary, or `undefined` when unknown/disabled.
   */
  public async getQueue(queueName: string): Promise<QueueSummary | undefined> {
    const queues = await this.listQueues();
    return queues.find((queue) => queue.queueName === queueName);
  }

  /**
   * Lists the messages (retry candidates) currently parked on a queue.
   * @param queueName the physical queue name.
   * @param page the paging instruction.
   * @returns a page of {@link QueuedMessageSummary} plus the total count.
   */
  public async listMessages(
    queueName: string,
    page: ProviderPage,
  ): Promise<SearchResult<QueuedMessageSummary>> {
    const startedAt = Date.now();
    const result = await this.client.listMessages(queueName, page);
    return {
      items: result.items.map(QueueEngine.toMessageSummary),
      total: result.total,
      tookMs: Date.now() - startedAt,
    };
  }

  /**
   * Removes a single message from a queue.
   * @param queueName the physical queue name.
   * @param messageId the message to remove.
   */
  public async deleteMessage(queueName: string, messageId: string): Promise<void> {
    return this.client.deleteMessage(queueName, messageId);
  }

  /**
   * Purges all messages from a queue.
   * @param queueName the physical queue name.
   * @returns the number of messages removed.
   */
  public async purgeQueue(queueName: string): Promise<number> {
    return this.client.purgeQueue(queueName);
  }

  /**
   * Reads one message directly by its composite key — cheaper and more honest than
   * {@link listMessages}-and-scan when the queue it should be on is already known.
   * @param queueName the physical queue name to check.
   * @param messageId the message id to look up.
   * @returns the queued message summary, or `undefined` when it is not sitting on that queue.
   */
  public async getMessage(
    queueName: string,
    messageId: string,
  ): Promise<QueuedMessageSummary | undefined> {
    const message = await this.client.getMessage(queueName, messageId);
    return message === undefined ? undefined : QueueEngine.toMessageSummary(message);
  }

  /**
   * Requests a retry of a message sitting on a known queue — a direct passthrough to
   * {@link JmsClient.retryMessage}, independent of `config/queues.json`'s dead-letter/retry
   * topology (unlike {@link module:./RecoveryEngine.RecoveryEngine}, this never needs a configured
   * queue pairing — the caller already knows exactly which queue the message is on).
   * @param messageId the message id to retry.
   * @param queueName the physical queue name it currently sits on.
   * @param reason optional operator-supplied reason, captured in the audit log.
   * @returns the retry outcome.
   */
  public async retryMessage(
    messageId: string,
    queueName: string,
    reason?: string,
  ): Promise<RetryResponseDto> {
    return this.client.retryMessage({ messageId, queueName, reason });
  }

  private static toSummary(
    queueName: string,
    config: QueueConfig | undefined,
    state: QueueRuntimeInfo | undefined,
  ): QueueSummary {
    const capacityUsedPct = clampUtilization(state?.capacityUsedPct ?? 0);
    return {
      queueName,
      displayName: config?.displayName ?? queueName,
      description: config?.description ?? "",
      state: state?.state ?? "UNKNOWN",
      messageCount: state?.messageCount ?? 0,
      consumerCount: state?.consumerCount ?? 0,
      capacityUsedPct,
      utilization: capacityUsedPct,
      health: queueHealth(capacityUsedPct),
      deadLetterQueue: config?.deadLetterQueue ?? "",
      retryQueue: config?.retryQueue ?? "",
      // Discovered-but-unconfigured queues (Fetch_All) have no declared ordering — rank them last
      // rather than fabricating a priority (1 = highest, per `config/queues.json`'s own doc comment).
      priority: config?.priority ?? Number.MAX_SAFE_INTEGER,
      retryStrategy: config?.retryStrategy ?? "manual",
      maxRetries: config?.maxRetries ?? 0,
    };
  }

  private static toMessageSummary(message: QueuedMessage): QueuedMessageSummary {
    return {
      messageId: message.messageId,
      queueName: message.queueName,
      enqueuedAt: message.enqueuedAt,
      retryCount: message.retryCount,
      sizeBytes: message.sizeBytes,
      sizeHuman: formatBytesHuman(message.sizeBytes),
    };
  }
}
