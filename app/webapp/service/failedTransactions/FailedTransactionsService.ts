import BaseService from "../../core/base/BaseService";
import type {
  FailedTransactionDetail,
  FailedTransactionListResponse,
  FailedTransactionPayload,
  FailedTransactionQuery,
  FailedTransactionRetryResult,
} from "./FailedTransactionsTypes";

/** Data service for the Failed Transactions module — the only layer that calls the API client. */
export default class FailedTransactionsService extends BaseService {
  public constructor() {
    super("/api/v1/failed-transactions");
  }

  /** Messages on the TPM dead-letter queues, newest first. */
  public list(
    query: FailedTransactionQuery,
    signal?: AbortSignal,
  ): Promise<FailedTransactionListResponse> {
    return this.client.get<FailedTransactionListResponse>(this.path(), {
      query: { ...query },
      signal,
    });
  }

  /** One message with its recovery path, retry history and linked interchange. */
  public getDetail(messageId: string, queueName: string): Promise<FailedTransactionDetail> {
    return this.client.get<FailedTransactionDetail>(this.path(encodeURIComponent(messageId)), {
      query: { queue: queueName },
    });
  }

  /** The parked message's body, read from the broker. */
  public getPayload(messageId: string, queueName: string): Promise<FailedTransactionPayload> {
    return this.client.get<FailedTransactionPayload>(
      this.path(`${encodeURIComponent(messageId)}/payload`),
      { query: { queue: queueName } },
    );
  }

  /** Moves one message back to its main queue, verifies it arrived, then retries it. */
  public retry(
    messageId: string,
    queueName: string,
    reason?: string,
  ): Promise<FailedTransactionRetryResult> {
    return this.client.post<FailedTransactionRetryResult>(
      this.path(`${encodeURIComponent(messageId)}/retry`),
      { queueName, reason },
    );
  }

  /** Retries several messages; every item reports its own outcome. */
  public retryMany(
    items: readonly { readonly messageId: string; readonly queueName: string }[],
    reason?: string,
  ): Promise<{ readonly results: readonly FailedTransactionRetryResult[] }> {
    return this.client.post<{ readonly results: readonly FailedTransactionRetryResult[] }>(
      this.path("retry"),
      { items, reason },
    );
  }
}
