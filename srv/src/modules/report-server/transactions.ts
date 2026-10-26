import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { MessageLogFilter } from "../../core/providers/types.js";
import type {
  MessageSummary,
  TransactionDetail,
  TransactionFramework,
  TransactionSummary,
} from "../../operations/dto/index.js";
import { TransactionAnalyzer } from "../../operations/transactions/TransactionAnalyzer.js";
import { HttpError } from "../../core/errors/HttpError.js";

const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const DEFAULT_PAGE_SIZE = 50;
/** Processing logs read for one transaction's detail. */
export const MAX_STEPS = 200;
/** Failed steps whose error details are read for the detail panel. */
const MAX_ERROR_STEPS = 3;

/** Which framework a transaction must have used (`none` = no framework at all). */
export type TransactionFrameworkFilter = "jms" | "router" | "none";

/** Filters for the non-B2B transaction list (already validated). */
export interface TransactionListQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  /** A processing-log status any step of the transaction has (e.g. `FAILED`). */
  readonly status?: string;
  readonly sender?: string;
  readonly receiver?: string;
  /** Part of an integration flow name. */
  readonly integrationFlow?: string;
  readonly correlationId?: string;
  readonly mplId?: string;
  readonly applicationId?: string;
  readonly messageType?: string;
  readonly framework?: TransactionFrameworkFilter;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TransactionListResponse {
  readonly items: readonly TransactionSummary[];
  readonly page: number;
  readonly pageSize: number;
  /** Processing logs matching the filters on the tenant (each transaction has one or more). */
  readonly logsTotal: number;
  /** Whether more processing logs remain beyond this page. */
  readonly hasMore: boolean;
  /** Transactions on this page left out because they belong to the B2B (TPM) screens. */
  readonly b2bExcluded: number;
}

/** An error recorded against one failed step. */
export interface TransactionError {
  readonly messageId: string;
  readonly integrationFlow: string;
  readonly label: string;
  readonly text: string;
  readonly category: string | undefined;
}

/** A message of this transaction currently parked on a dead-letter queue. */
export interface ParkedMessage {
  readonly queueName: string;
  readonly jmsMessageId: string;
  readonly framework: TransactionFramework;
  readonly retryCount: number;
  readonly parkedAt: string;
  /** Where a retry from Failed Transactions would send it; `undefined` = to be chosen there. */
  readonly retryTarget: string | undefined;
}

export interface TransactionDetailResponse extends TransactionDetail {
  readonly errors: readonly TransactionError[];
  readonly parked: readonly ParkedMessage[];
  /** The ingress dispatcher's raw queue header, when present (shown as evidence). */
  readonly queueHeader: string | undefined;
}

/**
 * Report Server for non-B2B transactions: the processing logs of every other flow, read straight
 * from the MPL API and folded by correlation id into one row per business transaction — the Common
 * IDoc Router and JMS framework hops plus the business flow they delivered to. TPM flows belong to
 * the B2B side and are left out.
 */
export class TransactionsService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * One page of transactions, newest first. Paging runs over processing logs (the tenant pages
   * those); each page's logs are folded into transactions with their complete chains, so one page
   * shows fewer rows than logs. The client merges pages by correlation id.
   */
  public async list(query: TransactionListQuery): Promise<TransactionListResponse> {
    const engine = this.engineFactory();
    const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const logs = await engine.message.pageLogs(TransactionsService.toFilter(query), {
      skip: (page - 1) * pageSize,
      top: pageSize,
    });
    const ids = [...new Set(logs.items.map((log) => log.correlationId))];
    const chains = await engine.message.listRunsByCorrelationIds(ids);

    let b2bExcluded = 0;
    const items: TransactionSummary[] = [];
    for (const id of ids) {
      const known = chains.get(id) ?? [];
      const chain = known.length > 0 ? known : logs.items.filter((log) => log.correlationId === id);
      if (chain.some((step) => analyzer.isB2bFlow(step.integrationFlow))) {
        b2bExcluded += 1;
        continue;
      }
      const transaction = analyzer.analyze(chain);
      if (
        transaction !== undefined &&
        TransactionsService.matchesFramework(transaction, query.framework)
      ) {
        items.push(TransactionsService.summarize(transaction));
      }
    }
    items.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

    return {
      items,
      page,
      pageSize,
      logsTotal: logs.total,
      hasMore: page * pageSize < logs.total,
      b2bExcluded,
    };
  }

  /** One transaction: every step, its framework path, errors, and where it is parked. */
  public async getById(correlationId: string): Promise<TransactionDetailResponse> {
    const engine = this.engineFactory();
    const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
    const runs = await engine.message.listRunsByCorrelationId(correlationId, MAX_STEPS);
    if (runs.length === 0) {
      throw HttpError.notFound(`No processing logs found for correlation id "${correlationId}".`);
    }
    return TransactionsService.describe(engine, analyzer, runs);
  }

  /**
   * The detail of a transaction whose processing logs are already read: its analysis plus the
   * ingress queue header, errors and parked messages (the journey reuses this).
   * @param runs every processing log of one correlation id (non-empty).
   */
  public static async describe(
    engine: OperationsEngine,
    analyzer: TransactionAnalyzer,
    runs: readonly MessageSummary[],
  ): Promise<TransactionDetailResponse> {
    const ingress = analyzer.jmsHeaderStep(runs);
    const headers =
      ingress === undefined
        ? undefined
        : await engine.message.getCustomHeaders(ingress.messageId).catch(() => undefined);
    const transaction = analyzer.analyze(runs, headers) as TransactionDetail;
    const headerName = analyzer.jmsConfig?.queueResolution?.headerName;
    const queueHeader =
      headers === undefined || headerName === undefined
        ? undefined
        : Object.entries(headers).find(
            ([name]) => name.toLowerCase() === headerName.toLowerCase(),
          )?.[1];

    const [errors, parked] = await Promise.all([
      TransactionsService.errorsOf(engine, transaction),
      TransactionsService.parkedOf(engine, analyzer, transaction),
    ]);
    return { ...transaction, errors, parked, queueHeader };
  }

  private static async errorsOf(
    engine: OperationsEngine,
    transaction: TransactionDetail,
  ): Promise<TransactionError[]> {
    const failed = [...transaction.steps]
      .reverse()
      .filter((step) => step.statusCategory === "error")
      .slice(0, MAX_ERROR_STEPS);
    const details = await Promise.all(
      failed.map(async (step) => {
        try {
          const entries = await engine.message.getErrorDetails(step.messageId);
          return entries.map((entry) => ({
            messageId: step.messageId,
            integrationFlow: step.integrationFlow,
            label: step.label,
            text: entry.text,
            category: entry.category,
          }));
        } catch {
          return [];
        }
      }),
    );
    return details.flat();
  }

  /** Looks for this transaction's message on the router and JMS dead-letter queues it passed through. */
  private static async parkedOf(
    engine: OperationsEngine,
    analyzer: TransactionAnalyzer,
    transaction: TransactionDetail,
  ): Promise<ParkedMessage[]> {
    const candidates: {
      readonly queue: string;
      readonly framework: TransactionFramework;
      readonly target: string | undefined;
    }[] = [];
    if (transaction.router?.deadLetterQueue !== undefined) {
      candidates.push({
        queue: transaction.router.deadLetterQueue,
        framework: "COMMON_IDOC_ROUTER",
        target:
          analyzer.routerConfig?.topology.dlqRecoveryMap[transaction.router.deadLetterQueue] ??
          transaction.router.queue,
      });
    }
    if (transaction.jms?.deadLetterQueue !== undefined) {
      candidates.push({
        queue: transaction.jms.deadLetterQueue,
        framework: "JMS_FRAMEWORK",
        target: transaction.jms.queue,
      });
    }
    const found = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const messages = await engine.queue.findMessages(candidate.queue, {
            correlationId: transaction.correlationId,
          });
          return messages.map((message) => ({
            queueName: candidate.queue,
            jmsMessageId: message.messageId,
            framework: candidate.framework,
            retryCount: message.retryCount,
            parkedAt: message.enqueuedAt,
            retryTarget: candidate.target,
          }));
        } catch {
          return [];
        }
      }),
    );
    return found.flat();
  }

  private static matchesFramework(
    transaction: TransactionSummary,
    filter: TransactionFrameworkFilter | undefined,
  ): boolean {
    switch (filter) {
      case "jms":
        return transaction.frameworks.includes("JMS_FRAMEWORK");
      case "router":
        return transaction.frameworks.includes("COMMON_IDOC_ROUTER");
      case "none":
        return transaction.frameworks.length === 0;
      default:
        return true;
    }
  }

  /** The list row: the transaction without its step list. */
  private static summarize(transaction: TransactionDetail): TransactionSummary {
    const { steps: _steps, ...summary } = transaction;
    return summary;
  }

  private static toFilter(query: TransactionListQuery): MessageLogFilter {
    return {
      from: query.dateFrom,
      to: query.dateTo,
      status: query.status,
      sender: query.sender,
      receiver: query.receiver,
      search: query.integrationFlow,
      correlationId: query.correlationId,
      messageId: query.mplId,
      applicationId: query.applicationId,
      messageType: query.messageType,
    };
  }
}

export const transactionsService = new TransactionsService();

/** Re-exported for the controller's typing. */
export type { MessageSummary };
