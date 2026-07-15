import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { OperationsQueryBuilder } from "../../operations/models/index.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { MessageSummary, MessageDetails } from "../../operations/dto/index.js";
import { HttpError } from "../../core/errors/HttpError.js";
import type {
  DlqMessageDto,
  DlqMessageListDto,
  DlqRecoveryDto,
  DlqReplayResultDto,
} from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/** How many failed messages the master list fetches (bounded working set). */
const DLQ_PAGE_SIZE = 100;

/** Prefix of the Partner Directory parameter that resolves a route's target JMS queue. */
const QUEUE_JMS_PREFIX = "QUEUE_JMS_";

/**
 * Aggregation service for the DLQ & Intelligent Recovery Dashboard (spec §6). Reads failed messages
 * from the MPL monitoring API (`engine.message`) and resolves the recovery queue for a message from
 * the Partner Directory agreement (`engine.partnerDirectory`) — the read side of spec §6C's queue
 * resolution algorithm. No SDK/OData/CPI shape leaves this layer.
 */
export class CoeDlqService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Lists failed messages (the DLQ master list, spec §6A).
   * @returns the failed-message rows and the total match count.
   */
  public async listFailedMessages(): Promise<DlqMessageListDto> {
    const engine = this.engineFactory();
    const query = new OperationsQueryBuilder()
      .status("FAILED")
      .page(1)
      .pageSize(DLQ_PAGE_SIZE)
      .sortBy("startTime")
      .desc()
      .build();
    const result = await engine.message.queryMessages(query);
    return { items: result.items.map(CoeDlqService.toRow), total: result.total };
  }

  /**
   * Resolves the recovery context for one failed message (spec §6B/§6C).
   * @param messageId the MPL message id.
   * @returns the recovery context (queue resolution + error details).
   * @throws {HttpError} 404 when the message is unknown.
   */
  public async getRecovery(messageId: string): Promise<DlqRecoveryDto> {
    const engine = this.engineFactory();
    const details = await engine.message.getMessage(messageId);
    if (details === undefined) {
      throw HttpError.notFound(`No message found with id "${messageId}".`);
    }
    const agreementPid = CoeDlqService.agreementPid(details.sender, details.receiver);
    const resolvedQueue = await CoeDlqService.resolveQueue(engine, agreementPid);
    return {
      messageId: details.messageId,
      sender: details.sender,
      receiver: details.receiver,
      messageType: details.messageType,
      agreementPid,
      resolvedQueue,
      resolutionSource: resolvedQueue === undefined ? "unavailable" : "partner-directory",
      errorDetails: CoeDlqService.toErrorDetails(details),
    };
  }

  /**
   * Attempts a replay of one failed message (spec §6C). Resolves the target queue from the Partner
   * Directory; automatic re-injection through the CoE platform replay endpoint is not exposed by the
   * current SDK, so the result reports the resolved queue for a manual replay rather than fabricating
   * an execution.
   * @param messageId the MPL message id.
   * @returns the replay result.
   * @throws {HttpError} 404 when the message is unknown.
   */
  public async replay(messageId: string): Promise<DlqReplayResultDto> {
    const recovery = await this.getRecovery(messageId);
    return {
      messageId,
      resolvedQueue: recovery.resolvedQueue,
      executed: false,
      note:
        recovery.resolvedQueue === undefined
          ? "No routing agreement resolves a target queue for this message; replay requires a configured route."
          : `Resolved target queue "${recovery.resolvedQueue}". Automatic re-injection via the CoE replay endpoint is not exposed by this SDK — replay the message onto this queue from the operator tooling.`,
    };
  }

  /** Resolves a route's target queue by reading the first `QUEUE_JMS_*` parameter under the agreement PID. */
  private static async resolveQueue(
    engine: OperationsEngine,
    agreementPid: string,
  ): Promise<string | undefined> {
    const parameters = await engine.partnerDirectory.listStringParameters(agreementPid);
    return parameters.find((parameter) => parameter.id.startsWith(QUEUE_JMS_PREFIX))?.value;
  }

  private static agreementPid(sender: string, receiver: string): string {
    return `.${sender}.${receiver}`;
  }

  private static toRow(message: MessageSummary): DlqMessageDto {
    return {
      messageId: message.messageId,
      correlationId: message.correlationId,
      interfaceTarget: message.integrationFlow,
      sender: message.sender,
      receiver: message.receiver,
      messageType: message.messageType,
      documentId: message.applicationId,
      status: message.status,
      severity: message.severity,
      startTime: message.startTime,
    };
  }

  private static toErrorDetails(details: MessageDetails): DlqRecoveryDto["errorDetails"] {
    return details.errorDetails.map((error) => ({ text: error.text, category: error.category }));
  }
}

/** Shared service instance. */
export const coeDlqService = new CoeDlqService();
