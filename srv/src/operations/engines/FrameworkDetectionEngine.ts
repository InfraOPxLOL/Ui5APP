import type { FrameworkConfig } from "../../config/schemas/index.js";
import type { MessageSummary } from "../dto/MessageDto.js";
import type {
  DetectionConfidence,
  DetectionEvidence,
  FrameworkDetection,
  ProcessingFramework,
  QueueRole,
  RecoveryPathStep,
} from "../dto/FrameworkDto.js";

/**
 * Probes whether a message is currently sitting on a queue. Injected rather than taking a
 * `QueueEngine` directly so this engine stays a pure classifier with one narrow dependency — and so
 * cheap detection can simply not pass one.
 */
export type QueueProbe = (queueName: string, messageId: string) => Promise<boolean>;

/**
 * Classifies which processing framework a message belongs to (Phase 13, §1), driven entirely by
 * `config/frameworks.json` — no framework name, iFlow name or queue name is hardcoded here.
 *
 * Two entry points with deliberately different cost profiles:
 *
 * - {@link detectCheap} — list-facing. Integration-flow name patterns plus correlation-group flow
 *   names, both evaluated against data the caller *already has* in memory. **Zero upstream calls**,
 *   so the investigation grid can show a Processing Framework column for every row without paying
 *   per row.
 * - {@link detectFull} — selection-facing. Adds custom-header rules and real queue-membership
 *   evidence, which cost a header read and up to N keyed queue lookups. Only run for a single
 *   message the operator actually selected, or when building a recovery plan.
 *
 * **Never guesses.** Every rule that runs records a {@link DetectionEvidence} entry whether it
 * matched or not, so an `UNKNOWN` result carries the reason nothing matched. A message is only
 * `NON_FRAMEWORK` when rules ran and positively excluded every framework; when the evidence is merely
 * absent it stays `UNKNOWN` — the two are different answers and the UI shows them differently.
 *
 * Frameworks are evaluated in ascending `priority` (the order `ConfigService.getEnabledFrameworks()`
 * returns), and the first framework reaching `confirmed` confidence wins outright. A `probable`
 * match is held as a candidate while lower-priority frameworks are still checked for a `confirmed`
 * one, so strong evidence always beats a mere name-shape match regardless of priority.
 */
export class FrameworkDetectionEngine {
  /** Compiled once per engine instance — the same regexes are applied to every row of a page. */
  private readonly compiled: readonly CompiledFramework[];

  public constructor(frameworks: readonly FrameworkConfig[]) {
    this.compiled = frameworks.map(compileFramework);
  }

  /**
   * Cheap, list-facing classification: integration-flow patterns and correlation-group flow names
   * only. Costs nothing upstream — the caller supplies the correlation group it already holds.
   * @param message the message to classify.
   * @param correlationGroup every message sharing this message's correlation id, including itself.
   *   Pass just `[message]` when no group is available; the correlation rules then simply cannot match.
   * @returns the classification, with `detectedQueue`/`queueRole` left unresolved.
   */
  public detectCheap(
    message: MessageSummary,
    correlationGroup: readonly MessageSummary[],
  ): FrameworkDetection {
    const evidence: DetectionEvidence[] = [];
    const candidate = this.evaluateFlowRules(message, correlationGroup, evidence);
    // Not exhaustive: no header rule ran and no queue was probed, so a framework detectable only by
    // those signals is still entirely possible. An unmatched result here is `UNKNOWN`, never
    // `NON_FRAMEWORK` — claiming the latter would assert something this pass cannot know.
    return this.finalize(message, evidence, candidate, undefined, "UNKNOWN", false);
  }

  /**
   * Full classification: everything {@link detectCheap} does, plus custom-header rules and real
   * queue-membership evidence.
   *
   * Queue evidence is decisive for frameworks whose only configured signal is their topology (Common
   * IDoc Router and IDoc Status Sync today), and *corroborating* for those that also match on flow
   * rules — per the standing instruction that a queue match alone does not prove a message's full
   * processing history, so it is combined with MPL/correlation evidence rather than replacing it.
   *
   * @param message the message to classify.
   * @param correlationGroup every message sharing this message's correlation id, including itself.
   * @param customHeaders the message's custom headers (name → value).
   * @param probe resolves whether the message is sitting on a given queue.
   * @returns the classification, including where the message was actually found.
   */
  public async detectFull(
    message: MessageSummary,
    correlationGroup: readonly MessageSummary[],
    customHeaders: Readonly<Record<string, string>>,
    probe: QueueProbe,
  ): Promise<FrameworkDetection> {
    const evidence: DetectionEvidence[] = [];
    let candidate = this.evaluateFlowRules(message, correlationGroup, evidence);
    candidate = this.evaluateHeaderRules(customHeaders, evidence, candidate);

    const located = await this.locate(message.messageId, probe, evidence);
    if (located !== undefined) {
      // Direct evidence: the message really is on this framework's queue. It outranks a name-shape
      // match, and confirms a flow-rule match that already pointed at the same framework.
      const confirms = candidate?.framework.id === located.framework.id;
      evidence.push({
        rule: `${located.framework.id}.queueTopology`,
        matched: true,
        outcome: confirms
          ? `Found on "${located.queueName}", corroborating the flow-rule match.`
          : `Found on "${located.queueName}", a ${located.framework.id} ${located.role === "DLQ" ? "dead-letter" : "processing"} queue.`,
      });
      return this.finalize(
        message,
        evidence,
        { framework: located.framework, confidence: "confirmed", rule: `${located.framework.id}.queueTopology` },
        located.queueName,
        located.role,
        true,
      );
    }

    // Exhaustive: flow rules, header rules and every configured queue have all been checked, so an
    // unmatched result here is a positive "belongs to no known framework" rather than an unknown.
    return this.finalize(message, evidence, candidate, undefined, "NONE", true);
  }

  // --- Rule evaluation ---------------------------------------------------------

  /**
   * Runs the two flow-based rule kinds across every framework, recording evidence for each. Returns
   * the best candidate found: a `confirmed` correlation-flow match short-circuits; otherwise the
   * highest-priority `probable` name-pattern match is carried forward.
   */
  private evaluateFlowRules(
    message: MessageSummary,
    correlationGroup: readonly MessageSummary[],
    evidence: DetectionEvidence[],
  ): Candidate | undefined {
    const flowNames = new Set(correlationGroup.map((entry) => entry.integrationFlow.toLowerCase()));
    let probable: Candidate | undefined;

    for (const framework of this.compiled) {
      const required = framework.config.detect.correlationFlowNames;
      if (required.length > 0) {
        const missing = required.filter((name) => !flowNames.has(name.toLowerCase()));
        const rule = `${framework.config.id}.correlationFlowNames`;
        if (missing.length === 0) {
          evidence.push({
            rule,
            matched: true,
            outcome: `Correlation chain contains all required flows: ${required.join(", ")}.`,
          });
          // Confirmed evidence — nothing weaker can outrank it, so stop here.
          return { framework: framework.config, confidence: "confirmed", rule };
        }
        evidence.push({
          rule,
          matched: false,
          outcome: `Correlation chain is missing required flow(s): ${missing.join(", ")}.`,
        });
      }

      if (framework.flowPatterns.length > 0) {
        const rule = `${framework.config.id}.integrationFlowPatterns`;
        const hit = framework.flowPatterns.find((pattern) => pattern.test(message.integrationFlow));
        if (hit !== undefined) {
          evidence.push({
            rule,
            matched: true,
            outcome: `Integration flow "${message.integrationFlow}" matches /${hit.source}/.`,
          });
          probable ??= { framework: framework.config, confidence: "probable", rule };
        } else {
          evidence.push({
            rule,
            matched: false,
            outcome: `Integration flow "${message.integrationFlow}" matches none of this framework's name patterns.`,
          });
        }
      }
    }
    return probable;
  }

  /**
   * Runs the two header-based rule kinds. A header match is direct evidence of framework
   * participation, so it upgrades a `probable` candidate to `confirmed`.
   */
  private evaluateHeaderRules(
    customHeaders: Readonly<Record<string, string>>,
    evidence: DetectionEvidence[],
    current: Candidate | undefined,
  ): Candidate | undefined {
    if (current?.confidence === "confirmed") {
      return current;
    }
    const byLowerName = new Map(
      Object.entries(customHeaders).map(([name, value]) => [name.toLowerCase(), value]),
    );
    let candidate = current;

    for (const framework of this.compiled) {
      const names = framework.config.detect.customHeaderNames;
      if (names.length > 0) {
        const rule = `${framework.config.id}.customHeaderNames`;
        const present = names.filter((name) => byLowerName.has(name.toLowerCase()));
        if (present.length === names.length) {
          evidence.push({
            rule,
            matched: true,
            outcome: `All required custom headers present: ${names.join(", ")}.`,
          });
          return { framework: framework.config, confidence: "confirmed", rule };
        }
        evidence.push({
          rule,
          matched: false,
          outcome: `Missing required custom header(s): ${names.filter((name) => !byLowerName.has(name.toLowerCase())).join(", ")}.`,
        });
      }

      if (framework.headerMatches.length > 0) {
        const rule = `${framework.config.id}.customHeaderMatches`;
        const matched = framework.headerMatches.every(({ name, pattern }) => {
          const value = byLowerName.get(name.toLowerCase());
          return value !== undefined && pattern.test(value);
        });
        if (matched) {
          evidence.push({
            rule,
            matched: true,
            outcome: `All custom-header value rules matched.`,
          });
          return { framework: framework.config, confidence: "confirmed", rule };
        }
        evidence.push({
          rule,
          matched: false,
          outcome: `One or more custom-header value rules did not match.`,
        });
        candidate ??= undefined;
      }
    }
    return candidate;
  }

  /**
   * Probes every configured framework's queues in `traversalOrder` until the message is found.
   * Frameworks with no topology are skipped (their messages are located by their own strategy, e.g.
   * the JMS framework's header-derived queue).
   */
  private async locate(
    messageId: string,
    probe: QueueProbe,
    evidence: DetectionEvidence[],
  ): Promise<LocatedQueue | undefined> {
    for (const framework of this.compiled) {
      for (const queueName of framework.config.topology.traversalOrder) {
        if (await probe(queueName, messageId)) {
          return {
            framework: framework.config,
            queueName,
            role: framework.config.topology.deadLetterQueues.includes(queueName) ? "DLQ" : "MAIN",
          };
        }
      }
      if (framework.config.topology.traversalOrder.length > 0) {
        evidence.push({
          rule: `${framework.config.id}.queueTopology`,
          matched: false,
          outcome: `Not present on any ${framework.config.id} queue (${framework.config.topology.traversalOrder.join(", ")}).`,
        });
      }
    }
    return undefined;
  }

  // --- Result assembly ---------------------------------------------------------

  /**
   * @param exhaustive whether every available signal was evaluated — flow rules *and* header rules
   *   *and* queue probes. Only an exhaustive pass may conclude `NON_FRAMEWORK`; a partial one that
   *   found nothing reports `UNKNOWN`, because a framework it never got to check could still own the
   *   message.
   */
  private finalize(
    message: MessageSummary,
    evidence: readonly DetectionEvidence[],
    candidate: Candidate | undefined,
    detectedQueue: string | undefined,
    queueRole: QueueRole,
    exhaustive: boolean,
  ): FrameworkDetection {
    if (candidate === undefined) {
      // "Every signal was checked and excluded everything" is a positive NON_FRAMEWORK answer.
      // "Nothing could be evaluated", or "only some signals were checked", stays honestly UNKNOWN —
      // the two mean different things to an operator and the UI shows them differently.
      const concludedNoFramework = exhaustive && evidence.length > 0;
      return {
        framework: concludedNoFramework ? "NON_FRAMEWORK" : "UNKNOWN",
        confidence: "none",
        matchedRule: undefined,
        detectedQueue: undefined,
        queueRole,
        sourceMplId: message.messageId,
        correlationId: message.correlationId,
        evidence,
        possibleRecoveryPath: undefined,
      };
    }

    return {
      framework: candidate.framework.id as ProcessingFramework,
      confidence: candidate.confidence,
      matchedRule: candidate.rule,
      detectedQueue,
      queueRole,
      sourceMplId: message.messageId,
      correlationId: message.correlationId,
      evidence,
      possibleRecoveryPath: FrameworkDetectionEngine.derivePath(
        candidate.framework,
        detectedQueue,
        queueRole,
      ),
    };
  }

  /**
   * Derives the recovery path this detection implies. Authoritative once the message has actually
   * been located; before that it is the framework's *indicative* topology path, which the recovery
   * plan later replaces with the real one.
   */
  private static derivePath(
    framework: FrameworkConfig,
    detectedQueue: string | undefined,
    queueRole: QueueRole,
  ): readonly RecoveryPathStep[] | undefined {
    if (detectedQueue === undefined) {
      return undefined;
    }
    if (queueRole === "DLQ") {
      const target = framework.topology.dlqRecoveryMap[detectedQueue];
      if (target === undefined) {
        return undefined;
      }
      return [
        { action: "LOCATED", queueName: detectedQueue, description: `Found on "${detectedQueue}".` },
        { action: "MOVE", queueName: target, description: `Move to "${target}".` },
        { action: "VERIFY", queueName: target, description: `Confirm it arrived on "${target}".` },
        { action: "RETRY", queueName: target, description: `Retry from "${target}".` },
      ];
    }
    return [
      { action: "LOCATED", queueName: detectedQueue, description: `Found on "${detectedQueue}".` },
      { action: "RETRY", queueName: detectedQueue, description: `Retry from "${detectedQueue}".` },
    ];
  }
}

// --- Internal shapes -----------------------------------------------------------

interface Candidate {
  readonly framework: FrameworkConfig;
  readonly confidence: DetectionConfidence;
  readonly rule: string;
}

interface LocatedQueue {
  readonly framework: FrameworkConfig;
  readonly queueName: string;
  readonly role: QueueRole;
}

interface CompiledFramework {
  readonly config: FrameworkConfig;
  readonly flowPatterns: readonly RegExp[];
  readonly headerMatches: readonly { readonly name: string; readonly pattern: RegExp }[];
}

/** Compiles a framework's regex rules once. Sources are already validated at boot by the zod schema. */
function compileFramework(config: FrameworkConfig): CompiledFramework {
  return {
    config,
    flowPatterns: config.detect.integrationFlowPatterns.map((source) => new RegExp(source)),
    headerMatches: config.detect.customHeaderMatches.map((match) => ({
      name: match.name,
      pattern: new RegExp(match.valuePattern),
    })),
  };
}
