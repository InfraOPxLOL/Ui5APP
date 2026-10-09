import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { FrameworkConfig } from "../../config/schemas/index.js";
import type {
  FrameworkDetection,
  InterchangeSummary,
  MessageSummary,
  QueuedMessageSummary,
  RecoveryPathStep,
} from "../../operations/dto/index.js";
import type { MessageRecoveryInput } from "../../operations/engines/RecoveryEngine.js";
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
  FailedTransactionDetail,
  FailedTransactionListResponse,
  FailedTransactionRetryResult,
  FailedTransactionRow,
  RetryHistory,
} from "./dto.js";

const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;
const DEFAULT_PAGE_SIZE = 50;
/** Messages read per dead-letter queue for one listing. */
const MAX_MESSAGES_PER_QUEUE = 1000;
/** Processing runs read per correlation id for the retry history. */
const MAX_HISTORY_RUNS = 200;
/** The framework whose dead-letter topology this module serves. */
const TPM_FRAMEWORK_ID = "TPM_V2";

export interface FailedTransactionListQuery {
  readonly queue?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

interface DeadLetterTopology {
  readonly framework: FrameworkConfig;
  readonly deadLetterQueues: readonly string[];
  readonly targets: Readonly<Record<string, string>>;
}

/**
 * Failed Transactions: messages parked on Trading Partner Management's dead-letter queues, with a
 * Retry that moves each one back to its mapped main queue and retries it there.
 *
 * Every queue name comes from `config/frameworks.json` (TPM_V2 `deadLetterQueues` and
 * `dlqRecoveryMap`), never from code. Retry delegates to the Recovery Engine's message-scoped
 * move, verify, retry sequence, so the concurrency lock and verify-before-retry gate are the same
 * ones Message Monitoring uses.
 */
export class FailedTransactionsService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /** Lists failed messages across the TPM dead-letter queues, newest first. */
  public async list(query: FailedTransactionListQuery): Promise<FailedTransactionListResponse> {
    const engine = this.engineFactory();
    const topology = FailedTransactionsService.topology(engine);
    const queues =
      query.queue === undefined
        ? topology.deadLetterQueues
        : [FailedTransactionsService.assertDeadLetterQueue(topology, query.queue)];

    const perQueue = await Promise.all(
      queues.map(async (queueName) => {
        try {
          const result = await engine.queue.listMessages(queueName, {
            skip: 0,
            top: MAX_MESSAGES_PER_QUEUE,
          });
          return { queueName, messages: result.items, total: result.total, error: undefined };
        } catch (error) {
          return {
            queueName,
            messages: [] as readonly QueuedMessageSummary[],
            total: 0,
            error: error instanceof Error ? error.message : "The queue could not be read.",
          };
        }
      }),
    );

    const counts: DeadLetterQueueCount[] = perQueue.map((entry) => ({
      queueName: entry.queueName,
      deadLetterKind: FailedTransactionsService.kindOf(entry.queueName),
      targetQueue: topology.targets[entry.queueName],
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
    const interchanges = await FailedTransactionsService.linkInterchanges(engine, visible);

    return {
      items: visible.map((message) =>
        FailedTransactionsService.toRow(topology, message, interchanges.get(message.messageId)),
      ),
      total: rows.length,
      page,
      pageSize,
      queues: counts,
    };
  }

  /** One failed message with its recovery path, retry history and linked interchange. */
  public async getDetail(messageId: string, queueName: string): Promise<FailedTransactionDetail> {
    const engine = this.engineFactory();
    const topology = FailedTransactionsService.topology(engine);
    FailedTransactionsService.assertDeadLetterQueue(topology, queueName);

    const message = await engine.queue.getMessage(queueName, messageId);
    if (message === undefined) {
      throw HttpError.notFound(
        `Message "${messageId}" is no longer on "${queueName}". It may already have been retried or removed.`,
      );
    }

    const [history, interchange] = await Promise.all([
      FailedTransactionsService.history(engine, message),
      FailedTransactionsService.findInterchange(engine, message.mplId),
    ]);
    return {
      message: FailedTransactionsService.toRow(
        topology,
        message,
        interchange === undefined ? undefined : FailedTransactionsService.toRef(interchange),
      ),
      recoveryPath: FailedTransactionsService.recoveryPath(queueName, topology.targets[queueName]),
      history,
      interchange,
    };
  }

  /** The body of one parked message, read from the broker. */
  public async getPayload(messageId: string, queueName: string): Promise<FailedTransactionPayload> {
    const engine = this.engineFactory();
    FailedTransactionsService.assertDeadLetterQueue(
      FailedTransactionsService.topology(engine),
      queueName,
    );
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

  /** Moves one message back to its mapped main queue, verifies it arrived, then retries it. */
  public async retry(
    messageId: string,
    queueName: string,
    reason: string | undefined,
  ): Promise<FailedTransactionRetryResult> {
    const engine = this.engineFactory();
    const topology = FailedTransactionsService.topology(engine);
    return this.retryOne(engine, topology, messageId, queueName, reason);
  }

  /** Retries several messages one after another; one failure never stops the rest. */
  public async retryMany(
    items: readonly { readonly messageId: string; readonly queueName: string }[],
    reason: string | undefined,
  ): Promise<FailedTransactionBulkRetryResult> {
    const engine = this.engineFactory();
    const topology = FailedTransactionsService.topology(engine);
    const results: FailedTransactionRetryResult[] = [];
    for (const item of items) {
      results.push(await this.retryOne(engine, topology, item.messageId, item.queueName, reason));
    }
    return { results };
  }

  private async retryOne(
    engine: OperationsEngine,
    topology: DeadLetterTopology,
    messageId: string,
    queueName: string,
    reason: string | undefined,
  ): Promise<FailedTransactionRetryResult> {
    FailedTransactionsService.assertDeadLetterQueue(topology, queueName);
    const message = await engine.queue.getMessage(queueName, messageId);
    const input = FailedTransactionsService.recoveryInput(messageId, queueName, message, reason);
    const outcome = await engine.recovery.executeMessageRecovery(input);
    return { messageId, queueName, outcome };
  }

  /**
   * The Recovery Engine is MPL-shaped; a dead-letter message is already located, so it is described
   * to it directly: the JMS message id as the message id and a TPM_V2 detection on the known queue.
   */
  private static recoveryInput(
    messageId: string,
    queueName: string,
    message: QueuedMessageSummary | undefined,
    reason: string | undefined,
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
      framework: TPM_FRAMEWORK_ID,
      confidence: "confirmed",
      matchedRule: "failedTransactions.deadLetterListing",
      detectedQueue: queueName,
      queueRole: "DLQ",
      sourceMplId: message?.mplId ?? messageId,
      correlationId,
      evidence: [
        {
          rule: "failedTransactions.deadLetterListing",
          matched: true,
          outcome: `Listed on the TPM dead-letter queue "${queueName}".`,
        },
      ],
      possibleRecoveryPath: undefined,
    };
    return { message: summary, detection, customHeaders: {}, reason };
  }

  private static async history(
    engine: OperationsEngine,
    message: QueuedMessageSummary,
  ): Promise<RetryHistory> {
    const runs =
      message.correlationId === undefined
        ? []
        : await engine.message.listRunsByCorrelationId(message.correlationId, MAX_HISTORY_RUNS);
    return {
      correlationId: message.correlationId,
      attempts: runs.length,
      retries: Math.max(0, runs.length - 1),
      failedAttempts: runs.filter((run) => run.severity === "error").length,
      jmsRetryCount: message.retryCount,
      runs: runs.map((run) => ({
        mplId: run.messageId,
        integrationFlow: run.integrationFlow,
        status: run.status,
        humanReadableStatus: run.humanReadableStatus,
        severity: run.severity,
        startTime: run.startTime,
        endTime: run.endTime,
      })),
      truncated: runs.length >= MAX_HISTORY_RUNS,
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

  private static topology(engine: OperationsEngine): DeadLetterTopology {
    const framework = engine.frameworkConfigs.find(
      (config) => config.id === TPM_FRAMEWORK_ID && config.enabled,
    );
    if (framework === undefined || framework.topology.deadLetterQueues.length === 0) {
      throw new HttpError(
        503,
        "TPM_TOPOLOGY_NOT_CONFIGURED",
        "No TPM dead-letter queues are configured. Enable TPM_V2 in config/frameworks.json and list its deadLetterQueues.",
      );
    }
    return {
      framework,
      deadLetterQueues: framework.topology.deadLetterQueues,
      targets: framework.topology.dlqRecoveryMap,
    };
  }

  private static assertDeadLetterQueue(topology: DeadLetterTopology, queueName: string): string {
    if (!topology.deadLetterQueues.includes(queueName)) {
      throw HttpError.badRequest(`"${queueName}" is not a configured TPM dead-letter queue.`);
    }
    return queueName;
  }

  private static kindOf(queueName: string): DeadLetterKind {
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
          description: "No recovery target is configured for this queue.",
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
    topology: DeadLetterTopology,
    message: QueuedMessageSummary,
    interchange: FailedInterchangeRef | undefined,
  ): FailedTransactionRow {
    return {
      messageId: message.messageId,
      queueName: message.queueName,
      deadLetterKind: FailedTransactionsService.kindOf(message.queueName),
      targetQueue: topology.targets[message.queueName],
      failedAt: message.enqueuedAt,
      jmsRetryCount: message.retryCount,
      mplId: message.mplId,
      correlationId: message.correlationId,
      sender: message.sender,
      receiver: message.receiver,
      messageType: message.messageType,
      applicationId: message.applicationId,
      expiresAt: message.expiresAt,
      interchange,
    };
  }
}

export const failedTransactionsService = new FailedTransactionsService();
