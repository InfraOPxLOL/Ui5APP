import { categoryOf, type FrameworkConfig } from "../../config/schemas/index.js";
import type { MessageSummary } from "../dto/MessageDto.js";
import type {
  JmsInvolvement,
  JmsQueueSource,
  JmsStage,
  RouterInvolvement,
  TransactionDetail,
  TransactionFramework,
  TransactionStatusCategory,
  TransactionStep,
} from "../dto/TransactionDto.js";

const SUCCESS = new Set(["COMPLETED"]);
const ERROR = new Set(["FAILED", "ERROR", "ESCALATED", "ABANDONED", "DISCARDED", "CANCELLED"]);
const IN_PROGRESS = new Set(["RETRY", "PROCESSING"]);

/** A resolved JMS queue and how it was found. */
export interface ResolvedJmsQueue {
  readonly queue: string;
  readonly source: JmsQueueSource;
}

interface CompiledStep {
  readonly pattern: RegExp;
  readonly label: string;
}

interface CompiledFramework {
  readonly config: FrameworkConfig;
  readonly flowPatterns: readonly RegExp[];
  readonly steps: readonly CompiledStep[];
}

/** The framework a flow belongs to, and what to call its step. */
interface StepClassification {
  readonly framework: FrameworkConfig | undefined;
  readonly label: string;
  /** The first capture group of the matched step pattern (e.g. the router's inbound variant). */
  readonly capture: string | undefined;
}

/**
 * Folds the processing logs that share one correlation id into one business transaction.
 *
 * A non-B2B message typically passes through the Common IDoc Router (inbound flow, router main), the
 * JMS framework (ingress dispatcher, queue consumer, egress dispatcher) and finally the business flow
 * — each a separate processing log. This names every step, works out which frameworks were used,
 * which JMS queue carried the message and how far it got, so one row can say what happened.
 *
 * Everything framework-specific — flow names, step labels, the queue header, the consumer-flow →
 * queue table, the dead-letter queues — comes from `config/frameworks.json`; nothing is hardcoded.
 * Pure and synchronous, so it is unit tested directly.
 */
export class TransactionAnalyzer {
  private readonly frameworks: readonly CompiledFramework[];

  public constructor(configs: readonly FrameworkConfig[]) {
    this.frameworks = [...configs]
      .filter((config) => config.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((config) => ({
        config,
        flowPatterns: config.detect.integrationFlowPatterns.map((source) => new RegExp(source)),
        steps: config.steps.map((step) => ({
          pattern: new RegExp(step.flowPattern),
          label: step.label,
        })),
      }));
  }

  /** The JMS framework's configuration, when enabled. */
  public get jmsConfig(): FrameworkConfig | undefined {
    return this.frameworks.find((entry) => entry.config.id === "JMS_FRAMEWORK")?.config;
  }

  /** The Common IDoc Router's configuration, when enabled. */
  public get routerConfig(): FrameworkConfig | undefined {
    return this.frameworks.find((entry) => entry.config.id === "COMMON_IDOC_ROUTER")?.config;
  }

  /** Whether a flow belongs to a B2B framework (TPM), whose transactions the B2B screens own. */
  public isB2bFlow(integrationFlow: string): boolean {
    const framework = this.classify(integrationFlow).framework;
    return framework !== undefined && categoryOf(framework) === "b2b";
  }

  /** The JMS processing queues a message can be sent to, for the operator's manual choice. */
  public jmsProcessingQueues(): string[] {
    const table = this.jmsConfig?.queueResolution?.consumerFlowQueues ?? {};
    return [...new Set(Object.values(table))].sort((a, b) => a.localeCompare(b));
  }

  /**
   * The queue a JMS-framework message belongs on: the ingress dispatcher's queue header first, then
   * the queue consumer flow that picked the message up. `undefined` when neither says — the
   * operator then chooses; no queue is ever guessed.
   * @param flows the integration flow names of the message's correlation chain, newest first.
   * @param headers the custom headers of the log entry carrying the queue header (the ingress dispatcher's).
   */
  public resolveJmsQueue(
    flows: readonly string[],
    headers: Readonly<Record<string, string>> | undefined,
  ): ResolvedJmsQueue | undefined {
    const resolution = this.jmsConfig?.queueResolution;
    if (resolution === undefined) {
      return undefined;
    }
    const fromHeader = TransactionAnalyzer.parseQueueHeader(
      headers ?? {},
      resolution.headerName,
      resolution.headerValuePattern,
    );
    if (fromHeader !== undefined) {
      return { queue: fromHeader, source: "header" };
    }
    const table = new Map(
      Object.entries(resolution.consumerFlowQueues).map(([flow, queue]) => [
        flow.toLowerCase(),
        queue,
      ]),
    );
    const queues = [
      ...new Set(
        flows
          .map((flow) => table.get(flow.toLowerCase()))
          .filter((queue): queue is string => queue !== undefined),
      ),
    ];
    // Two different consumers in one chain would be contradictory evidence — not resolvable.
    return queues.length === 1 && queues[0] !== undefined
      ? { queue: queues[0], source: "consumerFlow" }
      : undefined;
  }

  /** The log entry whose custom headers carry the JMS queue (the ingress dispatcher), if in the chain. */
  public jmsHeaderStep(chain: readonly MessageSummary[]): MessageSummary | undefined {
    const config = this.jmsConfig;
    const flowName =
      config?.queueResolution?.headerFlowName ?? config?.detect.correlationFlowNames[0];
    if (flowName === undefined) {
      return undefined;
    }
    const wanted = flowName.toLowerCase();
    return [...chain]
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .find((entry) => entry.integrationFlow.toLowerCase() === wanted);
  }

  /**
   * Analyses one correlation chain.
   * @param chain every processing log sharing the correlation id (any order).
   * @param jmsHeaders the custom headers of the chain's JMS ingress dispatcher, when already read.
   * @returns the transaction, or `undefined` for an empty chain.
   */
  public analyze(
    chain: readonly MessageSummary[],
    jmsHeaders?: Readonly<Record<string, string>>,
  ): TransactionDetail | undefined {
    const ordered = [...chain].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const first = ordered[0];
    const last = ordered.at(-1);
    if (first === undefined || last === undefined) {
      return undefined;
    }

    const classified = ordered.map((message) => ({
      message,
      ...this.classify(message.integrationFlow),
    }));
    const steps = classified.map(({ message, framework, label }) =>
      TransactionAnalyzer.toStep(message, framework, label),
    );
    const business = [...steps].reverse().find((step) => step.role === "business");
    const latest = steps.at(-1) as TransactionStep;

    const router = this.routerInvolvement(classified);
    const jms = this.jmsInvolvement(classified, jmsHeaders);
    const frameworks: TransactionFramework[] = [];
    if (router !== undefined) {
      frameworks.push("COMMON_IDOC_ROUTER");
    }
    if (jms !== undefined) {
      frameworks.push("JMS_FRAMEWORK");
    }

    // The business flow's outcome is the transaction's. Before it has run, the latest framework step
    // decides: a failure is a failure, anything else means the message is still on its way.
    let status = business?.status ?? latest.status;
    let statusCategory = business?.statusCategory ?? latest.statusCategory;
    if (business === undefined && frameworks.length > 0 && statusCategory !== "error") {
      status = "IN_PROCESS";
      statusCategory = "inProgress";
    }

    const source = business ?? latest;
    const sourceMessage = ordered.find((message) => message.messageId === source.messageId) ?? last;
    const pick = (field: "sender" | "receiver"): string =>
      sourceMessage[field] !== ""
        ? sourceMessage[field]
        : (ordered.find((m) => m[field] !== "")?.[field] ?? "");

    const path: string[] = [];
    if (router !== undefined) {
      path.push(
        router.inbound === undefined
          ? this.routerLabel()
          : `${this.routerLabel()} (${router.inbound})`,
      );
    }
    if (jms !== undefined) {
      path.push(jms.queue === undefined ? "JMS" : `JMS · ${jms.queue}`);
    }
    if (business !== undefined) {
      path.push(business.integrationFlow);
    }

    return {
      correlationId: first.correlationId,
      businessFlow: business?.integrationFlow,
      headline: business ?? latest,
      sender: pick("sender"),
      receiver: pick("receiver"),
      applicationId:
        sourceMessage.applicationId ?? ordered.find((m) => m.applicationId)?.applicationId,
      messageType: sourceMessage.messageType ?? ordered.find((m) => m.messageType)?.messageType,
      status,
      humanReadableStatus: status === "IN_PROCESS" ? "In process" : source.humanReadableStatus,
      statusCategory,
      startedAt: first.startTime,
      lastActivityAt: last.endTime ?? last.startTime,
      path,
      frameworks,
      jms,
      router,
      stepCount: steps.length,
      steps,
    };
  }

  private routerLabel(): string {
    return this.routerConfig?.label ?? "Common router";
  }

  /** Names a flow's step: the first framework step pattern that matches, else the flow itself. */
  private classify(integrationFlow: string): StepClassification {
    for (const framework of this.frameworks) {
      for (const step of framework.steps) {
        const match = step.pattern.exec(integrationFlow);
        if (match !== null) {
          return {
            framework: framework.config,
            label: step.label.replace(/\$(\d)/g, (_, index: string) => match[Number(index)] ?? ""),
            capture: match[1],
          };
        }
      }
      if (framework.flowPatterns.some((pattern) => pattern.test(integrationFlow))) {
        return { framework: framework.config, label: framework.config.label, capture: undefined };
      }
    }
    return { framework: undefined, label: integrationFlow, capture: undefined };
  }

  private routerInvolvement(
    classified: readonly (StepClassification & { readonly message: MessageSummary })[],
  ): RouterInvolvement | undefined {
    const config = this.routerConfig;
    const steps = classified.filter((entry) => entry.framework?.id === "COMMON_IDOC_ROUTER");
    if (config === undefined || steps.length === 0) {
      return undefined;
    }
    const latest = steps.at(-1)?.message;
    const category = latest === undefined ? "unknown" : TransactionAnalyzer.category(latest.status);
    const inbound = steps.find((entry) => entry.capture !== undefined)?.capture;
    return {
      inbound,
      stage: category === "error" ? "failed" : category === "success" ? "routed" : "processing",
      queue: config.topology.activeQueues[0],
      deadLetterQueue: config.topology.deadLetterQueues[0],
    };
  }

  private jmsInvolvement(
    classified: readonly (StepClassification & { readonly message: MessageSummary })[],
    jmsHeaders: Readonly<Record<string, string>> | undefined,
  ): JmsInvolvement | undefined {
    const config = this.jmsConfig;
    const steps = classified.filter((entry) => entry.framework?.id === "JMS_FRAMEWORK");
    if (config === undefined || steps.length === 0) {
      return undefined;
    }
    const resolution = config.queueResolution;
    const flows = [...steps].reverse().map((entry) => entry.message.integrationFlow);
    const resolved = this.resolveJmsQueue(flows, jmsHeaders);

    const egressFlow = config.steps.find((step) => /egress/i.test(step.label))?.flowPattern;
    const egress = egressFlow === undefined ? undefined : new RegExp(egressFlow);
    const consumerFlows = new Set(
      Object.keys(resolution?.consumerFlowQueues ?? {}).map((flow) => flow.toLowerCase()),
    );
    const latestEgress = [...steps]
      .reverse()
      .find((entry) => egress?.test(entry.message.integrationFlow));
    const latestConsumer = [...steps]
      .reverse()
      .find(
        (entry) =>
          consumerFlows.has(entry.message.integrationFlow.toLowerCase()) ||
          /consumer/i.test(entry.label),
      );

    let stage: JmsStage = "queued";
    if (latestEgress !== undefined) {
      const category = TransactionAnalyzer.category(latestEgress.message.status);
      stage = category === "success" ? "delivered" : category === "error" ? "failed" : "retrying";
    } else if (latestConsumer !== undefined) {
      const category = TransactionAnalyzer.category(latestConsumer.message.status);
      stage = category === "error" ? "failed" : category === "success" ? "delivered" : "retrying";
    }

    return {
      queue: resolved?.queue,
      queueSource: resolved?.source,
      stage,
      deadLetterQueue: resolution?.centralDeadLetterQueue,
    };
  }

  private static toStep(
    message: MessageSummary,
    framework: FrameworkConfig | undefined,
    label: string,
  ): TransactionStep {
    const id = framework?.id;
    return {
      messageId: message.messageId,
      integrationFlow: message.integrationFlow,
      label,
      role: id === "JMS_FRAMEWORK" || id === "COMMON_IDOC_ROUTER" ? "framework" : "business",
      framework: id === "JMS_FRAMEWORK" || id === "COMMON_IDOC_ROUTER" ? id : undefined,
      status: message.status,
      humanReadableStatus: message.humanReadableStatus,
      severity: message.severity,
      statusCategory: TransactionAnalyzer.category(message.status),
      startTime: message.startTime,
      endTime: message.endTime,
      processingTimeHuman: message.processingTimeHuman,
    };
  }

  /** Coarse grouping of a raw processing-log status. */
  public static category(status: string): TransactionStatusCategory {
    const normalized = status.toUpperCase();
    if (SUCCESS.has(normalized)) {
      return "success";
    }
    if (ERROR.has(normalized)) {
      return "error";
    }
    if (IN_PROGRESS.has(normalized)) {
      return "inProgress";
    }
    return "unknown";
  }

  /** Extracts the queue name from a decorated header value (case-insensitive header name). */
  public static parseQueueHeader(
    headers: Readonly<Record<string, string>>,
    headerName: string,
    valuePattern: string,
  ): string | undefined {
    const entry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === headerName.toLowerCase(),
    );
    if (entry === undefined) {
      return undefined;
    }
    const captured = new RegExp(valuePattern).exec(entry[1].trim())?.[1]?.trim();
    return captured === undefined || captured === "" ? undefined : captured;
  }
}
