import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import { categoryOf } from "../../config/schemas/index.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type {
  InterchangeDetailDto,
  JourneyStageKind,
  MessageSummary,
  TransactionJourney,
} from "../../operations/dto/index.js";
import {
  JourneyBuilder,
  type JourneyError,
  type StageParking,
} from "../../operations/transactions/JourneyBuilder.js";
import { TransactionAnalyzer } from "../../operations/transactions/TransactionAnalyzer.js";
import { HttpError } from "../../core/errors/HttpError.js";
import { MAX_STEPS, TransactionsService } from "./transactions.js";

const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/** What identifies the transaction. `id` is any of the three; the service works out which. */
export interface JourneyQuery {
  readonly id?: string;
  readonly correlationId?: string;
  readonly mplId?: string;
  readonly interchangeId?: string;
}

/** The transaction a query resolved to. */
interface ResolvedTransaction {
  readonly correlationId: string | undefined;
  readonly runs: readonly MessageSummary[];
  readonly interchange: InterchangeDetailDto | undefined;
}

/**
 * A transaction's journey for the Report Server, Failed Transactions and the Track Transaction page:
 * resolves a correlation id, processing log id or interchange id to the transaction's processing
 * logs (and interchange, for B2B), finds any message parked on a dead-letter queue, and lets the
 * {@link JourneyBuilder} lay out the stages and the next best action.
 */
export class JourneyService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async get(query: JourneyQuery): Promise<TransactionJourney> {
    const engine = this.engineFactory();
    const analyzer = new TransactionAnalyzer(engine.frameworkConfigs);
    const resolved = await this.resolve(engine, query);
    const isB2b =
      resolved.interchange !== undefined ||
      resolved.runs.some((run) => analyzer.isB2bFlow(run.integrationFlow));

    if (!isB2b) {
      const detail = await TransactionsService.describe(engine, analyzer, resolved.runs);
      return JourneyBuilder.nonB2b({
        transaction: detail,
        parked: detail.parked.map((parked) => ({
          stage: parked.framework === "COMMON_IDOC_ROUTER" ? "router" : "jms",
          queueName: parked.queueName,
          jmsMessageId: parked.jmsMessageId,
          parkedAt: parked.parkedAt,
          retryCount: parked.retryCount,
          retryTarget: parked.retryTarget,
        })),
        errors: detail.errors.map((error) => ({ messageId: error.messageId, text: error.text })),
        jmsEnabled: analyzer.jmsConfig !== undefined,
        now: this.now(),
      });
    }

    const interchange =
      resolved.interchange ?? (await JourneyService.interchangeOf(engine, resolved.runs));
    const correlationId =
      resolved.correlationId ?? resolved.runs[0]?.correlationId ?? interchange?.interchange.id ?? "";
    const tpmRuns = resolved.runs.filter((run) => analyzer.isB2bFlow(run.integrationFlow));
    const [parked, errors] = await Promise.all([
      JourneyService.parkedB2b(engine, correlationId),
      JourneyService.errorsB2b(engine, tpmRuns, interchange),
    ]);
    return JourneyBuilder.b2b({
      correlationId,
      runs: tpmRuns,
      interchange,
      parked,
      errors,
      now: this.now(),
    });
  }

  /** Finds the transaction an id belongs to; 404 when nothing does. */
  private async resolve(engine: OperationsEngine, query: JourneyQuery): Promise<ResolvedTransaction> {
    if (query.correlationId !== undefined) {
      return JourneyService.byCorrelation(engine, query.correlationId, true);
    }
    if (query.mplId !== undefined) {
      return JourneyService.byMpl(engine, query.mplId, true);
    }
    if (query.interchangeId !== undefined) {
      return JourneyService.byInterchange(engine, query.interchangeId, true);
    }
    const id = query.id ?? "";
    // Any id: a correlation id is the most common, then a processing log, then an interchange.
    for (const attempt of [
      () => JourneyService.byCorrelation(engine, id, false),
      () => JourneyService.byMpl(engine, id, false),
      () => JourneyService.byInterchange(engine, id, false),
    ]) {
      const found = await attempt().catch(() => undefined);
      if (found !== undefined && (found.runs.length > 0 || found.interchange !== undefined)) {
        return found;
      }
    }
    throw HttpError.notFound(`No transaction found for "${id}".`);
  }

  private static async byCorrelation(
    engine: OperationsEngine,
    correlationId: string,
    required: boolean,
  ): Promise<ResolvedTransaction> {
    const runs = await engine.message.listRunsByCorrelationId(correlationId, MAX_STEPS);
    if (runs.length === 0 && required) {
      throw HttpError.notFound(`No processing logs found for correlation id "${correlationId}".`);
    }
    return { correlationId, runs, interchange: undefined };
  }

  private static async byMpl(
    engine: OperationsEngine,
    mplId: string,
    required: boolean,
  ): Promise<ResolvedTransaction> {
    const log = (await engine.message.pageLogs({ messageId: mplId }, { skip: 0, top: 1 })).items[0];
    if (log === undefined) {
      if (required) {
        throw HttpError.notFound(`Processing log "${mplId}" was not found.`);
      }
      return { correlationId: undefined, runs: [], interchange: undefined };
    }
    return JourneyService.byCorrelation(engine, log.correlationId, required);
  }

  private static async byInterchange(
    engine: OperationsEngine,
    interchangeId: string,
    required: boolean,
  ): Promise<ResolvedTransaction> {
    const interchange = await engine.b2b.getInterchange(interchangeId);
    if (interchange === undefined) {
      if (required) {
        throw HttpError.notFound(`Interchange "${interchangeId}" was not found.`);
      }
      return { correlationId: undefined, runs: [], interchange: undefined };
    }
    // The interchange's events name its processing logs; their correlation id names the chain.
    const mplIds = [
      ...new Set(
        interchange.events
          .map((event) => event.monitoringId)
          .filter((id): id is string => id !== undefined),
      ),
    ];
    for (const mplId of mplIds.reverse()) {
      const found = await JourneyService.byMpl(engine, mplId, false);
      if (found.runs.length > 0) {
        return { ...found, interchange };
      }
    }
    return { correlationId: undefined, runs: [], interchange };
  }

  /** The interchange of a TPM chain, from its newest processing log; none when B2B is unavailable. */
  private static async interchangeOf(
    engine: OperationsEngine,
    runs: readonly MessageSummary[],
  ): Promise<InterchangeDetailDto | undefined> {
    for (const run of runs) {
      try {
        const summary = await engine.b2b.findInterchangeByMplId(run.messageId);
        if (summary !== undefined) {
          return await engine.b2b.getInterchange(summary.id);
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /** The transaction's messages on the B2B dead-letter queues, with where a retry sends them. */
  private static async parkedB2b(
    engine: OperationsEngine,
    correlationId: string,
  ): Promise<StageParking[]> {
    const b2bFrameworks = engine.frameworkConfigs.filter(
      (config) => config.enabled && categoryOf(config) === "b2b",
    );
    const found = await Promise.all(
      b2bFrameworks.flatMap((config) =>
        config.topology.deadLetterQueues.map(async (queueName) => {
          try {
            const messages = await engine.queue.findMessages(queueName, { correlationId });
            const stage: JourneyStageKind = /RECEIVER/i.test(queueName)
              ? "tpmDelivery"
              : "tpmProcessing";
            return messages.map((message) => ({
              stage,
              queueName,
              jmsMessageId: message.messageId,
              parkedAt: message.enqueuedAt,
              retryCount: message.retryCount,
              retryTarget: config.topology.dlqRecoveryMap[queueName],
            }));
          } catch {
            return [];
          }
        }),
      ),
    );
    return found.flat();
  }

  /** The interchange's recorded errors, then the latest failed processing log's. */
  private static async errorsB2b(
    engine: OperationsEngine,
    runs: readonly MessageSummary[],
    interchange: InterchangeDetailDto | undefined,
  ): Promise<JourneyError[]> {
    const errors: JourneyError[] = [];
    const failed = runs.find((run) => TransactionAnalyzer.category(run.status) === "error");
    if (failed !== undefined) {
      const details = await engine.message.getErrorDetails(failed.messageId).catch(() => []);
      errors.push(...details.map((detail) => ({ messageId: failed.messageId, text: detail.text })));
    }
    errors.push(
      ...(interchange?.errors ?? []).map((error) => ({
        messageId: undefined,
        text: error.errorInformation,
      })),
    );
    return errors;
  }
}

export const journeyService = new JourneyService();
