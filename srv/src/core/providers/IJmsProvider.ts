import type {
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
  QueueRuntimeInfo,
  QueuedMessage,
} from "./types.js";

/**
 * Access to JMS queue runtime state and queue-level operations on an Integration Suite tenant.
 *
 * Backing the JMS Queue Management module and, later, the Retry Center. In `Fetch_Specific`
 * discovery mode, which queues exist (and their DLQ/retry pairings) comes from
 * `config/queues.json` via the ConfigService; this provider reports and manipulates their
 * *runtime* state only. In `Fetch_All` mode, {@link discoverQueues} is used instead, and the
 * configured queue list is bypassed entirely (see `config/env.ts`'s `QueueDiscoveryMode`).
 */
export interface IJmsProvider {
  /**
   * Reads runtime state for the given queues.
   * @param context the tenant/correlation context.
   * @param queueNames the physical queue names to inspect (from configuration).
   * @returns runtime info per queue, in input order; unknown queues are omitted.
   */
  getQueueStates(
    context: ProviderContext,
    queueNames: readonly string[],
  ): Promise<readonly QueueRuntimeInfo[]>;

  /**
   * Discovers every queue the tenant itself currently reports, independent of
   * `config/queues.json` — the live counterpart to {@link getQueueStates}'s configuration-driven
   * lookup. Backs `QueueEngine`'s `Fetch_All` discovery mode.
   * @param context the tenant/correlation context.
   * @returns runtime info for every queue the tenant reports.
   */
  discoverQueues(context: ProviderContext): Promise<readonly QueueRuntimeInfo[]>;

  /**
   * Lists the messages currently sitting on a queue.
   * @param context the tenant/correlation context.
   * @param queueName the physical queue name.
   * @param page the paging instruction.
   * @returns one page of queued messages plus the total count.
   */
  listMessages(
    context: ProviderContext,
    queueName: string,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<QueuedMessage>>;

  /**
   * Removes a single message from a queue.
   * @param context the tenant/correlation context.
   * @param queueName the physical queue name.
   * @param messageId the message to remove.
   */
  deleteMessage(context: ProviderContext, queueName: string, messageId: string): Promise<void>;

  /**
   * Purges all messages from a queue.
   * @param context the tenant/correlation context.
   * @param queueName the physical queue name.
   * @returns the number of messages removed.
   */
  purgeQueue(context: ProviderContext, queueName: string): Promise<number>;

  /**
   * Requests a retry of one message parked on a queue (the Cloud Integration JMS OData API's
   * `RetryMessagingMessages` function import; mock mode simulates the same operation key).
   * @param context the tenant/correlation context.
   * @param queueName the physical queue name the message sits on.
   * @param messageId the JMS message id to retry.
   */
  retryMessage(context: ProviderContext, queueName: string, messageId: string): Promise<void>;

  /**
   * Moves specific messages from one queue to another (the Cloud Integration JMS OData API's
   * `MoveMessagingMessages` function import).
   *
   * Deliberately **message-specific**, never whole-queue: dead-letter recovery moves exactly the
   * message(s) an operator selected back to their processing queue, leaving the rest of the DLQ
   * untouched. This is the first half of the two-step DLQ recovery the framework strategies perform
   * (`MOVE` → verify the message really arrived → `RETRY` on the target queue); the caller is
   * responsible for the verification step, since acceptance of this call is not proof of arrival.
   *
   * @param context the tenant/correlation context.
   * @param sourceQueue the physical queue the messages currently sit on.
   * @param targetQueue the physical queue to move them to.
   * @param messageIds the specific JMS message ids to move.
   */
  moveMessages(
    context: ProviderContext,
    sourceQueue: string,
    targetQueue: string,
    messageIds: readonly string[],
  ): Promise<void>;

  /**
   * Reads one message directly by its composite key (`jmsMessageId` + `queueName`) — cheaper and
   * more honest than scanning a queue's full listing looking for a match.
   * @param context the tenant/correlation context.
   * @param queueName the physical queue name to check.
   * @param messageId the message id to look up.
   * @returns the queued message, or `undefined` when it is not sitting on that queue.
   */
  getMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<QueuedMessage | undefined>;
}
