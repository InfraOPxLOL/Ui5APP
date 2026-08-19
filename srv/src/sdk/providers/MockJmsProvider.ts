import type { IJmsProvider } from "../../core/providers/IJmsProvider.js";
import type {
  ProviderContext,
  ProviderPage,
  ProviderPagedResult,
  QueueRuntimeInfo,
  QueuedMessage,
} from "../../core/providers/types.js";
import type { MockEngine } from "../mock/MockEngine.js";
import {
  generateQueueStates,
  generateQueuedMessages,
  generateSingleMessage,
  recordMockMove,
  MOCK_DISCOVERED_QUEUE_NAMES,
} from "../mock/fixtures/index.js";

/** Mock implementation of {@link IJmsProvider} (architecture: Provider Framework, §10). */
export class MockJmsProvider implements IJmsProvider {
  public constructor(private readonly mockEngine: MockEngine) {}

  /** @inheritdoc */
  public async getQueueStates(
    context: ProviderContext,
    queueNames: readonly string[],
  ): Promise<readonly QueueRuntimeInfo[]> {
    return this.mockEngine.resolve({
      operationKey: "jms.getQueueStates",
      tenantId: context.tenantId,
      generateSuccess: () => generateQueueStates(queueNames),
      generateEmpty: () => [],
    });
  }

  /** @inheritdoc */
  public async discoverQueues(context: ProviderContext): Promise<readonly QueueRuntimeInfo[]> {
    return this.mockEngine.resolve({
      operationKey: "jms.discoverQueues",
      tenantId: context.tenantId,
      generateSuccess: () => generateQueueStates(MOCK_DISCOVERED_QUEUE_NAMES),
      generateEmpty: () => [],
    });
  }

  /** @inheritdoc */
  public async listMessages(
    context: ProviderContext,
    queueName: string,
    page: ProviderPage,
  ): Promise<ProviderPagedResult<QueuedMessage>> {
    const all = await this.mockEngine.resolve({
      operationKey: "jms.listMessages",
      tenantId: context.tenantId,
      generateSuccess: () => generateQueuedMessages(queueName, 30),
      generateEmpty: () => [],
      generateLarge: () => generateQueuedMessages(queueName, 250),
    });
    return { items: all.slice(page.skip, page.skip + page.top), total: all.length };
  }

  /** @inheritdoc */
  public async deleteMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<void> {
    await this.mockEngine.resolve({
      operationKey: "jms.deleteMessage",
      tenantId: context.tenantId,
      generateSuccess: () => ({ queueName, messageId }),
    });
  }

  /** @inheritdoc */
  public async purgeQueue(context: ProviderContext, queueName: string): Promise<number> {
    const messages = await this.mockEngine.resolve({
      operationKey: "jms.purgeQueue",
      tenantId: context.tenantId,
      generateSuccess: () => generateQueuedMessages(queueName, 12),
      generateEmpty: () => [],
    });
    return messages.length;
  }

  /** @inheritdoc */
  public async retryMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<void> {
    await this.mockEngine.resolve({
      operationKey: "jms.retryMessage",
      tenantId: context.tenantId,
      generateSuccess: () => ({ queueName, messageId }),
    });
  }

  /**
   * @inheritdoc
   *
   * Records the relocation in the fixture ledger on success, so the caller's verification step
   * (`getMessage` on the target queue) genuinely observes the move — without that, mock mode could
   * never exercise the move → verify → retry sequence. A failure scenario short-circuits before the
   * ledger is touched, leaving the message where it was.
   */
  public async moveMessages(
    context: ProviderContext,
    sourceQueue: string,
    targetQueue: string,
    messageIds: readonly string[],
  ): Promise<void> {
    await this.mockEngine.resolve({
      operationKey: "jms.moveMessages",
      tenantId: context.tenantId,
      generateSuccess: () => ({ sourceQueue, targetQueue, messageIds }),
    });
    recordMockMove(targetQueue, messageIds);
  }

  /** @inheritdoc */
  public async getMessage(
    context: ProviderContext,
    queueName: string,
    messageId: string,
  ): Promise<QueuedMessage | undefined> {
    return this.mockEngine.resolve({
      operationKey: "jms.getMessage",
      tenantId: context.tenantId,
      generateSuccess: () => generateSingleMessage(queueName, messageId),
      generateEmpty: () => undefined,
    });
  }
}
