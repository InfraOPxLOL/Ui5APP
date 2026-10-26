import BaseService from "../../core/base/BaseService";
import type {
  TransactionDetail,
  TransactionListResponse,
  TransactionQuery,
} from "./TransactionTypes";

/** Data service for non-B2B transactions (`/api/v1/report-server/transactions`). */
export default class TransactionService extends BaseService {
  public constructor() {
    super("/api/v1/report-server/transactions");
  }

  /** One page of transactions, newest first. */
  public list(query: TransactionQuery, signal?: AbortSignal): Promise<TransactionListResponse> {
    return this.client.get<TransactionListResponse>(this.path(), { query: { ...query }, signal });
  }

  /** One transaction with every step, its errors and where it is parked. */
  public getById(correlationId: string): Promise<TransactionDetail> {
    return this.client.get<TransactionDetail>(this.path(encodeURIComponent(correlationId)));
  }
}
