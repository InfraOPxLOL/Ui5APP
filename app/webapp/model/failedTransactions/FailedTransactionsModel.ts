import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  DeadLetterQueueCount,
  FailedTransaction,
  FailedTransactionDetail,
  FailedTransactionRetryResult,
} from "../../service/failedTransactions/FailedTransactionsTypes";

/** Shape of the Failed Transactions view model. */
export interface FailedTransactionsState {
  busy: boolean;
  detailBusy: boolean;
  retrying: boolean;
  /** Whether the user may retry (RetryOperator); hides every retry control otherwise. */
  canRetry: boolean;
  search: string;
  /** Empty = all configured dead-letter queues. */
  queueFilter: string;
  queues: DeadLetterQueueCount[];
  allCount: number;
  queueErrors: string;
  items: FailedTransaction[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  showingText: string;
  selectedCount: number;
  detail: FailedTransactionDetail | null;
  pathText: string;
  results: FailedTransactionRetryResult[];
  resultsHeadline: string;
}

/**
 * The single view model of the Failed Transactions module, exposed to the view as `view`.
 *
 * @namespace com.middlewareops.integrationportal.model.failedTransactions
 */
export default class FailedTransactionsModel extends JSONModel {
  public constructor() {
    const initial: FailedTransactionsState = {
      busy: false,
      detailBusy: false,
      retrying: false,
      canRetry: false,
      search: "",
      queueFilter: "",
      queues: [],
      allCount: 0,
      queueErrors: "",
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
      showingText: "",
      selectedCount: 0,
      detail: null,
      pathText: "",
      results: [],
      resultsHeadline: "",
    };
    super(initial);
  }
}
