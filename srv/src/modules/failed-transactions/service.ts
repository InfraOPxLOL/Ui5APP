import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import { categoryOf, type FrameworkConfig } from "../../config/schemas/index.js";
import type {
  FrameworkDetection,
  InterchangeSummary,
  MessageSummary,
  ProcessingFramework,
  QueuedMessageSummary,
  RecoveryPathStep,
  TransactionDetail,
} from "../../operations/dto/index.js";
import type { MessageRecoveryInput } from "../../operations/engines/RecoveryEngine.js";
import { TransactionAnalyzer } from "../../operations/transactions/TransactionAnalyzer.js";
import {
  formatDurationHuman,
  humanReadableStatus,
  severityOfStatus,
} from "../../operations/transform/index.js";
import { HttpError } from "../../core/errors/HttpError.js";
import type {
  FailedTransactionPayload,
  FailedTransactionPayloadFormat,
  DeadLetterKind,
  DeadLetterQueueCount,
  FailedInterchangeRef,
  FailedTransactionBulkRetryResult,
  FailedTransactionCategory,
  FailedTransactionDetail,
  FailedTransactionListResponse,
  FailedTransactionRetryResult,
  FailedTransactionRow,
  RetryHistory,
  TargetSource,
} from "./dto.js";

const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const DEFAULT_PAGE_SIZE = 50;
/** Messages read per dead-letter queue for one listing. */
const MAX_MESSAGES_PER_QUEUE = 1000;
/** Processing runs read per correlation id for the retry history. */
const MAX_HISTORY_RUNS = 200;

export interface FailedTransactionListQuery {
  /** Which dead-letter queues to list; defaults to B2B (TPM). */
  readonly category?: FailedTransactionCategory;
  readonly queue?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** One retry request: the parked message, and the queue the operator chose when one was needed. */
export interface FailedTransactionRetryItem {
  readonly messageId: string;
  readonly queueName: string;
  readonly targetQueue?: string;
}

/** One configured dead-letter queue and what it belongs to. */
interface DeadLetterQueueInfo {
  readonly queueName: string;
  readonly category: FailedTransactionCategory;
  readonly framework: FrameworkConfig;
  readonly kind: DeadLetterKind;
  /**
   * The queue a retry moves its messages back to (`dlqRecoveryMap`). `undefined` for the JMS
   * framework's central DLQ, which serves every JMS queue: there the target is per message.
   */
  readonly target: string | undefined;
}

/** Where a parked message should go, and how that was determined. */
interface ResolvedTarget {
  readonly queue: string | undefined;
  readonly source: TargetSource | undefined;
}

/**
 * Failed Transactions: messages parked on dead-letter queues, with a Retry that moves each one back
 * to the queue it belongs on and retries it there.
 *
 * Two categories, each with its own dead-letter queues from `config/frameworks.json`:
 * - **B2B** — Trading Partner Management's two DLQs, each mapped to one main queue.
 * - **Non-B2B** — the Common IDoc Router's DLQ (mapped to the router's processing queue) and the JMS
 *   framework's central DLQ, which serves every JMS queue. A JMS message's destination is resolved
 *   per message: the ingress dispatcher's queue header, else the queue consumer flow that picked it
 *   up, else the operator chooses from the framework's processing queues. Nothing is guessed.
 *
 * Retry delegates to the Recovery Engine's message-scoped move, verify, retry sequence, so the
 * concurrency lock and verify-before-retry gate are the same ones Message Monitoring uses.
 */
export class FailedTransactionsService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /** Lists failed messages across one category's dead-letter queues, newest first. */
  public async list(query: FailedTransactionListQuery): Promise<FailedTransactionListResponse> {
    const engine = this.engineFactory();
    const category = query.category ?? "b2b";
    const all = FailedTransactionsService.deadLetterQueues(engine, category);
    const queues =
      query.queue === undefined
        ? all
        : [FailedTransactionsService.assertDeadLetterQueue(engine, query.queue)].filter(
            (info) => info.category === category,
          );

    const perQueue = await Promise.all(
      queues.map(async (info) => {
        try {
          const result = await engine.queue.listMessages(info.queueName, {
            skip: 0,
            top: MAX_MESSAGES_PER_QUEUE,
          });
          return { info, messages: result.items, total: result.total, error: undefined };
        } catch (error) {
          return {
            info,
            messages: [] as readonly QueuedMessageSummary[],
            total: 0,
            error: error instanceof Error ? error.message : "The queue could not be read.",
          };
        }
      }),
    );

    const counts: DeadLetterQueueCount[] = perQueue.map((entry) => ({
      queueName: entry.info.queueName,
      category: entry.info.category,
      framework: entry.info.framework.id,
      deadLetterKind: entry.info.kind,
      targetQueue: entry.info.target,
      count: entry.total,
      error: entry.error,
    }));

    const needle = query.search?.toLowerCase();
    const rows = perQueue
      .flatMap((entry) => entry.messages)
      .filter(
        (message) => needle === undefined || FailedTransactionsService.matches(message, needle),
      )
      .sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt));

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const visible = rows.slice((page - 1) * pageSize, page * pageSize);
    const byQueue = new Map(queues.map((info) => [info.queueName, info]));

    let items: FailedTransactionRow[];
    if (category === "b2b") {
      const interchanges = await FailedTransactionsService.linkInterchanges(engine, visible);
      items = visible.map((message) =>
        FailedTransactionsService.toRow(
          byQueue.get(message.queueName) as DeadLetterQueueInfo,
          message,
          { queue: byQueue.get(message.queueName)?.target, source: "configured" },
          interchanges.get(message.messageId),
          undefined,
        ),
      );
    } else {
      items = await FailedTransactionsService.nonB2bRows(engine, visible, byQueue);
    }

    return { category, items, total: rows.length, page, pageSize, queues: counts };
  }

  /** One failed message with its recovery path, retry history and linked interchange or chain. */
  public async getDetail(messageId: string, queueName: string): Promise<FailedTransactionDetail> {
    const engine = this.engineFactory();
    const info = FailedTransactionsService.assertDeadLetterQueue(engine, queueName);

    const message = await engine.queue.getMessage(queueName, messageId);
    if (message === undefined) {
      throw HttpError.notFound(
        `Message "${messageId}" is no longer on "${queueName}". It may already have been retried or removed.`,
      );
    }

    const runs =
      message.correlationId === undefined
        ? []
        : await engine.message.listRunsByCorrelationId(message.correlationId, MAX_HISTORY_RUNS);
    const history = FailedTransactionsService.history(message, runs);

    if (info.category === "b2b") {
      const interchange = await FailedTransactionsService.findInterchange(engine, message.mplId);
      return {
        message: FailedTransactionsService.toRow(
          info,
          message,
          { queue: info.target, source: "configured" },
          interchange === undefined ? undefined : FailedTransactionsService.toRef(interchange),
          undefined,
        ),
        recoveryPath: FailedTransactionsService.recoveryPath(queueName, info.target, undefined),
        history,
        interchange,
        transaction: undefined,
        queueOptions: [],
      };
    }

    const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
    const { headers } = await FailedTransactionsService.jmsHeaders(engine, analyzer, runs);
    const transaction = runs.length === 0 ? undefined : analyzer.analyze(runs, headers);
    const target = FailedTransactionsService.resolveTarget(analyzer, info, runs, headers);
    return {
      message: FailedTransactionsService.toRow(info, message, target, undefined, transaction),
      recoveryPath: FailedTransactionsService.recoveryPath(queueName, target.queue, info.kind),
      history,
      interchange: undefined,
      transaction,
      queueOptions:
        info.kind === "jms" && target.queue === undefined ? analyzer.jmsProcessingQueues() : [],
    };
  }

  /** The body of one parked message, read from the broker. */
  public async getPayload(messageId: string, queueName: string): Promise<FailedTransactionPayload> {
    const engine = this.engineFactory();
    FailedTransactionsService.assertDeadLetterQueue(engine, queueName);
    const body = await engine.queue.getMessagePayload(queueName, messageId);
    if (body === undefined) {
      throw HttpError.notFound(
        `Message "${messageId}" is no longer on "${queueName}". It may already have been retried or removed.`,
      );
    }
    return {
      messageId,
      queueName,
      content: body.content,
      encoding: body.encoding,
      format: FailedTransactionsService.payloadFormat(body.encoding, body.content),
      sizeBytes: body.sizeBytes,
    };
  }

  /** A broker body carries no content type, so its format is read from its first characters. */
  private static payloadFormat(
    encoding: "text" | "base64",
    content: string,
  ): FailedTransactionPayloadFormat {
    if (encoding === "base64") {
      return "binary";
    }
    const start = content.trimStart();
    if (start.startsWith("<")) {
      return "xml";
    }
    if (start.startsWith("{") || start.startsWith("[")) {
      return "json";
    }
    if (/^(ISA|UNA|UNB)/.test(start)) {
      return "edi";
    }
    return "text";
  }

  /**
   * Moves one message back to the queue it belongs on, verifies it arrived, then retries it.
   * @param targetQueue the queue the operator chose — only used when the destination could not be
   *   determined (a JMS message whose header and consumer flow say nothing), and only one of the
   *   framework's processing queues.
   */
  public async retry(
    messageId: string,
    queueName: string,
    reason: string | undefined,
    targetQueue?: string,
  ): Promise<FailedTransactionRetryResult> {
    return this.retryOne(this.engineFactory(), { messageId, queueName, targetQueue }, reason);
  }

  /** Retries several messages one after another; one failure never stops the rest. */
  public async retryMany(
    items: readonly FailedTransactionRetryItem[],
    reason: string | undefined,
  ): Promise<FailedTransactionBulkRetryResult> {
    const engine = this.engineFactory();
    const results: FailedTransactionRetryResult[] = [];
    for (const item of items) {
      results.push(await this.retryOne(engine, item, reason));
    }
    return { results };
  }

  private async retryOne(
    engine: OperationsEngine,
    item: FailedTransactionRetryItem,
    reason: string | undefined,
  ): Promise<FailedTransactionRetryResult> {
    const { messageId, queueName } = item;
    const info = FailedTransactionsService.assertDeadLetterQueue(engine, queueName);
    const message = await engine.queue.getMessage(queueName, messageId);

    let customHeaders: Readonly<Record<string, string>> = {};
    let correlationFlows: readonly string[] = [];
    let operatorSelectedQueue: string | undefined;
    if (info.kind === "jms") {
      const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
      const runs =
        message?.correlationId === undefined
          ? []
          : await engine.message.listRunsByCorrelationId(message.correlationId, MAX_HISTORY_RUNS);
      customHeaders =
        (await FailedTransactionsService.jmsHeaders(engine, analyzer, runs)).headers ?? {};
      correlationFlows = FailedTransactionsService.newestFirst(runs).map(
        (run) => run.integrationFlow,
      );
      if (item.targetQueue !== undefined) {
        if (!analyzer.jmsProcessingQueues().includes(item.targetQueue)) {
          throw HttpError.badRequest(
            `"${item.targetQueue}" is not one of the JMS framework's processing queues.`,
          );
        }
        operatorSelectedQueue = item.targetQueue;
      }
    }

    const input = FailedTransactionsService.recoveryInput(
      info,
      messageId,
      message,
      reason,
      customHeaders,
      correlationFlows,
      operatorSelectedQueue,
    );
    const outcome = await engine.recovery.executeMessageRecovery(input);
    return { messageId, queueName, outcome };
  }

  /**
   * The Recovery Engine is MPL-shaped; a dead-letter message is already located, so it is described
   * to it directly: the JMS message id as the message id, and a detection of the queue's own
   * framework on that queue.
   */
  private static recoveryInput(
    info: DeadLetterQueueInfo,
    messageId: string,
    message: QueuedMessageSummary | undefined,
    reason: string | undefined,
    customHeaders: Readonly<Record<string, string>>,
    correlationFlows: readonly string[],
    operatorSelectedQueue: string | undefined,
  ): MessageRecoveryInput {
    const correlationId = message?.correlationId ?? messageId;
    const summary: MessageSummary = {
      messageId,
      correlationId,
      integrationFlow: "",
      status: "FAILED",
      humanReadableStatus: humanReadableStatus("FAILED"),
      severity: severityOfStatus("FAILED"),
      startTime: message?.enqueuedAt ?? new Date().toISOString(),
      endTime: undefined,
      processingTimeMs: undefined,
      processingTimeHuman: formatDurationHuman(undefined),
      sender: message?.sender ?? "",
      receiver: message?.receiver ?? "",
      applicationId: message?.applicationId,
      messageType: message?.messageType,
      customStatus: undefined,
      senderInterchangeControl: undefined,
      receiverInterchangeControl: undefined,
      businessRole: undefined,
    };
    const detection: FrameworkDetection = {
      framework: info.framework.id as ProcessingFramework,
      confidence: "confirmed",
      matchedRule: "failedTransactions.deadLetterListing",
      detectedQueue: info.queueName,
      queueRole: "DLQ",
      sourceMplId: message?.mplId ?? messageId,
      correlationId,
      evidence: [
        {
          rule: "failedTransactions.deadLetterListing",
          matched: true,
          outcome: `Listed on the ${info.framework.label} dead-letter queue "${info.queueName}".`,
        },
      ],
      possibleRecoveryPath: undefined,
    };
    return {
      message: summary,
      detection,
      customHeaders,
      reason,
      operatorSelectedQueue,
      correlationFlows,
    };
  }

  // --- Non-B2B ---------------------------------------------------------------------

  /**
   * Rows for non-B2B messages. The chains of the whole visible page are read in one batched call, so
   * each row can show its path and, for the JMS DLQ, the queue its consumer flow names. The ingress
   * header (the authoritative source) is read when a message is opened or retried.
   */
  private static async nonB2bRows(
    engine: OperationsEngine,
    visible: readonly QueuedMessageSummary[],
    byQueue: ReadonlyMap<string, DeadLetterQueueInfo>,
  ): Promise<FailedTransactionRow[]> {
    const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
    const ids = visible
      .map((message) => message.correlationId)
      .filter((id): id is string => id !== undefined);
    let chains: ReadonlyMap<string, readonly MessageSummary[]> = new Map();
    try {
      chains = await engine.message.listRunsByCorrelationIds(ids);
    } catch {
      // The chains only enrich the rows; without them each row still lists and retries.
    }
    return visible.map((message) => {
      const info = byQueue.get(message.queueName) as DeadLetterQueueInfo;
      const chain =
        message.correlationId === undefined ? [] : (chains.get(message.correlationId) ?? []);
      const transaction = chain.length === 0 ? undefined : analyzer.analyze(chain);
      const target = FailedTransactionsService.resolveTarget(analyzer, info, chain, undefined);
      return FailedTransactionsService.toRow(info, message, target, undefined, transaction);
    });
  }

  /** The JMS ingress dispatcher's custom headers (where the queue header lives), when in the chain. */
  private static async jmsHeaders(
    engine: OperationsEngine,
    analyzer: TransactionAnalyzer,
    runs: readonly MessageSummary[],
  ): Promise<{ readonly headers: Readonly<Record<string, string>> | undefined }> {
    const ingress = analyzer.jmsHeaderStep(runs);
    if (ingress === undefined) {
      return { headers: undefined };
    }
    try {
      return { headers: await engine.message.getCustomHeaders(ingress.messageId) };
    } catch {
      return { headers: undefined };
    }
  }

  /** Where a retry would send the message: the queue's mapping, or the JMS resolution order. */
  private static resolveTarget(
    analyzer: TransactionAnalyzer,
    info: DeadLetterQueueInfo,
    chain: readonly MessageSummary[],
    headers: Readonly<Record<string, string>> | undefined,
  ): ResolvedTarget {
    if (info.kind !== "jms") {
      return { queue: info.target, source: info.target === undefined ? undefined : "configured" };
    }
    const resolved = analyzer.resolveJmsQueue(
      FailedTransactionsService.newestFirst(chain).map((run) => run.integrationFlow),
      headers,
    );
    return { queue: resolved?.queue, source: resolved?.source };
  }

  private static newestFirst(runs: readonly MessageSummary[]): MessageSummary[] {
    return [...runs].sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  // --- Shared --------------------------------------------------------------------

  private static history(
    message: QueuedMessageSummary,
    runs: readonly MessageSummary[],
  ): RetryHistory {
    const newest = FailedTransactionsService.newestFirst(runs);
    return {
      correlationId: message.correlationId,
      attempts: newest.length,
      retries: Math.max(0, newest.length - 1),
      failedAttempts: newest.filter((run) => run.severity === "error").length,
      jmsRetryCount: message.retryCount,
      runs: newest.map((run) => ({
        mplId: run.messageId,
        integrationFlow: run.integrationFlow,
        status: run.status,
        humanReadableStatus: run.humanReadableStatus,
        severity: run.severity,
        startTime: run.startTime,
        endTime: run.endTime,
      })),
      truncated: newest.length >= MAX_HISTORY_RUNS,
    };
  }

  /** Interchange lookup that never fails the caller: no link or no TPM simply means none. */
  private static async findInterchange(
    engine: OperationsEngine,
    mplId: string | undefined,
  ): Promise<InterchangeSummary | undefined> {
    if (mplId === undefined) {
      return undefined;
    }
    try {
      return await engine.b2b.findInterchangeByMplId(mplId);
    } catch {
      return undefined;
    }
  }

  /** Links the visible page to interchanges. Stops after the first failure (e.g. TPM not active). */
  private static async linkInterchanges(
    engine: OperationsEngine,
    messages: readonly QueuedMessageSummary[],
  ): Promise<Map<string, FailedInterchangeRef>> {
    const links = new Map<string, FailedInterchangeRef>();
    const withMpl = messages.filter((message) => message.mplId !== undefined);
    const [first, ...rest] = withMpl;
    if (first === undefined) {
      return links;
    }
    try {
      const firstLink = await engine.b2b.findInterchangeByMplId(first.mplId as string);
      if (firstLink !== undefined) {
        links.set(first.messageId, FailedTransactionsService.toRef(firstLink));
      }
    } catch {
      return links;
    }
    const settled = await Promise.allSettled(
      rest.map((message) => engine.b2b.findInterchangeByMplId(message.mplId as string)),
    );
    settled.forEach((result, index) => {
      const message = rest[index];
      if (message !== undefined && result.status === "fulfilled" && result.value !== undefined) {
        links.set(message.messageId, FailedTransactionsService.toRef(result.value));
      }
    });
    return links;
  }

  /** Every configured dead-letter queue of the B2B and non-B2B frameworks. */
  private static allDeadLetterQueues(engine: OperationsEngine): DeadLetterQueueInfo[] {
    const queues: DeadLetterQueueInfo[] = [];
    for (const framework of engine.frameworkConfigs) {
      const category = categoryOf(framework);
      if (!framework.enabled || (category !== "b2b" && category !== "nonB2b")) {
        continue;
      }
      for (const queueName of framework.topology.deadLetterQueues) {
        queues.push({
          queueName,
          category,
          framework,
          kind: FailedTransactionsService.kindOf(framework, queueName),
          target: framework.topology.dlqRecoveryMap[queueName],
        });
      }
      const central = framework.queueResolution?.centralDeadLetterQueue;
      if (central !== undefined && !queues.some((info) => info.queueName === central)) {
        queues.push({
          queueName: central,
          category,
          framework,
          kind: FailedTransactionsService.kindOf(framework, central),
          target: undefined,
        });
      }
    }
    return queues;
  }

  private static deadLetterQueues(
    engine: OperationsEngine,
    category: FailedTransactionCategory,
  ): DeadLetterQueueInfo[] {
    const queues = FailedTransactionsService.allDeadLetterQueues(engine).filter(
      (info) => info.category === category,
    );
    if (queues.length === 0) {
      throw category === "b2b"
        ? new HttpError(
            503,
            "TPM_TOPOLOGY_NOT_CONFIGURED",
            "No TPM dead-letter queues are configured. Enable TPM_V2 in config/frameworks.json and list its deadLetterQueues.",
          )
        : new HttpError(
            503,
            "NON_B2B_TOPOLOGY_NOT_CONFIGURED",
            "No non-B2B dead-letter queues are configured. Enable JMS_FRAMEWORK / COMMON_IDOC_ROUTER (category nonB2b) in config/frameworks.json.",
          );
    }
    return queues;
  }

  private static assertDeadLetterQueue(
    engine: OperationsEngine,
    queueName: string,
  ): DeadLetterQueueInfo {
    const info = FailedTransactionsService.allDeadLetterQueues(engine).find(
      (candidate) => candidate.queueName === queueName,
    );
    if (info === undefined) {
      throw HttpError.badRequest(`"${queueName}" is not a configured dead-letter queue.`);
    }
    return info;
  }

  private static kindOf(framework: FrameworkConfig, queueName: string): DeadLetterKind {
    if (framework.id === "JMS_FRAMEWORK") {
      return "jms";
    }
    if (framework.id === "COMMON_IDOC_ROUTER") {
      return "router";
    }
    const upper = queueName.toUpperCase();
    if (upper.includes("PROCESSING")) {
      return "processing";
    }
    if (upper.includes("RECEIVER")) {
      return "receiver";
    }
    return "other";
  }

  private static recoveryPath(
    queueName: string,
    targetQueue: string | undefined,
    kind: DeadLetterKind | undefined,
  ): RecoveryPathStep[] {
    const located: RecoveryPathStep = {
      action: "LOCATED",
      queueName,
      description: `Parked on "${queueName}".`,
    };
    if (targetQueue === undefined) {
      return [
        located,
        {
          action: "MANUAL",
          queueName: undefined,
          description:
            kind === "jms"
              ? "Neither the queue header nor a queue consumer flow names the queue — choose the queue to send it to."
              : "No recovery target is configured for this queue.",
        },
      ];
    }
    return [
      located,
      { action: "MOVE", queueName: targetQueue, description: `Move to "${targetQueue}".` },
      {
        action: "VERIFY",
        queueName: targetQueue,
        description: `Confirm it arrived on "${targetQueue}".`,
      },
      { action: "RETRY", queueName: targetQueue, description: `Retry from "${targetQueue}".` },
    ];
  }

  private static matches(message: QueuedMessageSummary, needle: string): boolean {
    return [
      message.messageId,
      message.mplId,
      message.correlationId,
      message.sender,
      message.receiver,
      message.messageType,
      message.applicationId,
    ].some((value) => value !== undefined && value.toLowerCase().includes(needle));
  }

  private static toRef(interchange: InterchangeSummary): FailedInterchangeRef {
    return {
      id: interchange.id,
      overallStatus: interchange.overallStatus,
      senderPartner: interchange.sender.tradingPartnerName,
      receiverPartner: interchange.receiver.tradingPartnerName,
      documentStandard:
        interchange.sender.documentStandard ?? interchange.receiver.documentStandard,
      messageType: interchange.sender.messageType ?? interchange.receiver.messageType,
      controlNumber:
        interchange.sender.interchangeControlNumber ??
        interchange.receiver.interchangeControlNumber,
    };
  }

  private static toRow(
    info: DeadLetterQueueInfo,
    message: QueuedMessageSummary,
    target: ResolvedTarget,
    interchange: FailedInterchangeRef | undefined,
    transaction: TransactionDetail | undefined,
  ): FailedTransactionRow {
    return {
      messageId: message.messageId,
      queueName: message.queueName,
      category: info.category,
      framework: info.framework.id,
      deadLetterKind: info.kind,
      targetQueue: target.queue,
      targetSource: target.queue === undefined ? undefined : target.source,
      businessFlow: transaction?.businessFlow,
      path: transaction?.path ?? [],
      failedAt: message.enqueuedAt,
      jmsRetryCount: message.retryCount,
      mplId: message.mplId,
      correlationId: message.correlationId,
      sender: message.sender ?? (transaction?.sender || undefined),
      receiver: message.receiver ?? (transaction?.receiver || undefined),
      messageType: message.messageType,
      applicationId: message.applicationId,
      expiresAt: message.expiresAt,
      interchange,
    };
  }
}

export const failedTransactionsService = new FailedTransactionsService();
