import type { IJmsProvider } from "../../core/providers/IJmsProvider.js";
import type {
  ProviderPage,
  ProviderPagedResult,
  QueueRuntimeInfo,
  QueuedMessage,
} from "../../core/providers/types.js";
import type { RetryRequestDto, RetryResponseDto } from "../dto/RetryDto.js";
import { resolveContext, type ClientCallContext } from "./ClientCallContext.js";

/**
 * JMS queue sub-client (architecture: Integration Suite Client, §4 — `JmsClient`). Wraps
 * {@link IJmsProvider} for queue runtime state, message management and message retry.
 * {@link JmsClient.retryMessage} is provider-backed: the Cloud Integration JMS OData API's
 * `RetryMessagingMessages` function import in real mode, the mock engine's `jms.retryMessage`
 * operation key in mock mode (see `RealJmsProvider`/`MockJmsProvider.retryMessage`).
 */
export class JmsClient {
  public constructor(
    private readonly provider: IJmsProvider,
    private readonly defaultTenantId: string,
  ) {}

  /** Reads runtime state for the given queues. See {@link IJmsProvider.getQueueStates}. */
  public getQueueStates(
    queueNames: readonly string[],
    context?: ClientCallContext,
  ): Promise<readonly QueueRuntimeInfo[]> {
    return this.provider.getQueueStates(resolveContext(this.defaultTenantId, context), queueNames);
  }

  /** Discovers every queue the tenant reports, live. See {@link IJmsProvider.discoverQueues}. */
  public discoverQueues(context?: ClientCallContext): Promise<readonly QueueRuntimeInfo[]> {
    return this.provider.discoverQueues(resolveContext(this.defaultTenantId, context));
  }

  /** Lists messages on a queue. See {@link IJmsProvider.listMessages}. */
  public listMessages(
    queueName: string,
    page: ProviderPage,
    context?: ClientCallContext,
  ): Promise<ProviderPagedResult<QueuedMessage>> {
    return this.provider.listMessages(
      resolveContext(this.defaultTenantId, context),
      queueName,
      page,
    );
  }

  /** Deletes one message from a queue. See {@link IJmsProvider.deleteMessage}. */
  public deleteMessage(
    queueName: string,
    messageId: string,
    context?: ClientCallContext,
  ): Promise<void> {
    return this.provider.deleteMessage(
      resolveContext(this.defaultTenantId, context),
      queueName,
      messageId,
    );
  }

  /** Purges all messages from a queue. See {@link IJmsProvider.purgeQueue}. */
  public purgeQueue(queueName: string, context?: ClientCallContext): Promise<number> {
    return this.provider.purgeQueue(resolveContext(this.defaultTenantId, context), queueName);
  }

  /**
   * Requests a retry of a queue-parked message. See {@link IJmsProvider.retryMessage}.
   * @param request the message (and the queue it sits on) to retry.
   * @param context optional tenant/correlation override.
   * @returns the retry outcome; provider failures propagate as SDK-typed errors.
   */
  public async retryMessage(
    request: RetryRequestDto,
    context?: ClientCallContext,
  ): Promise<RetryResponseDto> {
    if (request.queueName === undefined || request.queueName === "") {
      throw new Error(
        "JmsClient.retryMessage requires a queueName — queue-originated retries are the only provider-backed retry path.",
      );
    }
    const resolved = resolveContext(this.defaultTenantId, context);
    await this.provider.retryMessage(resolved, request.queueName, request.messageId);
    return {
      messageId: request.messageId,
      accepted: true,
      correlationId: resolved.correlationId,
    };
  }

  /** Reads one message by its composite key. See {@link IJmsProvider.getMessage}. */
  public getMessage(
    queueName: string,
    messageId: string,
    context?: ClientCallContext,
  ): Promise<QueuedMessage | undefined> {
    return this.provider.getMessage(resolveContext(this.defaultTenantId, context), queueName, messageId);
  }
}
