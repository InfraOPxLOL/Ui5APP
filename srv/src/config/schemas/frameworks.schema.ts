import { z } from "zod";

/**
 * The closed set of processing frameworks the platform can *detect*. `NON_FRAMEWORK` and `UNKNOWN`
 * are deliberately absent: they are detection *outcomes* (see `ProcessingFramework` in
 * `operations/dto/FrameworkDto.ts`), never configurable entries — you cannot declare rules for
 * "no framework matched".
 */
export const CONFIGURABLE_FRAMEWORK_IDS = [
  "TPM_V2",
  "JMS_FRAMEWORK",
  "COMMON_IDOC_ROUTER",
  "IDOC_STATUS_SYNC",
] as const;

/** Union of the configurable framework ids. */
export type ConfigurableFrameworkId = (typeof CONFIGURABLE_FRAMEWORK_IDS)[number];

/** A compiled-at-boot regular expression source. Rejected here (not at match time) if it cannot compile. */
const regexSourceSchema = z.string().min(1).superRefine((value, ctx) => {
  try {
    new RegExp(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid regular expression: "${value}"` });
  }
});

/**
 * One custom-header match rule: the header must be present *and* its value must match
 * `valuePattern`. Header names are matched case-insensitively (CPI is inconsistent about casing).
 */
export const headerMatchSchema = z.object({
  name: z.string().min(1),
  valuePattern: regexSourceSchema,
});

/**
 * Detection rules for one framework. Every list is optional and defaults to empty — a framework
 * with no rules at all can still be detected through its queue topology (`topology.traversalOrder`),
 * which is the only signal confirmed for some frameworks today.
 *
 * - `integrationFlowPatterns` — regexes matched against the message's *own* integration flow name.
 *   A name-shape match alone yields `probable` confidence, never `confirmed`.
 * - `correlationFlowNames`    — exact integration-flow names that must *all* be present somewhere in
 *   the message's correlation group (this is the confirmed JMS-framework signal:
 *   `IF_JMS_ingress` + `IF_JMS_egress`). A full match yields `confirmed` confidence.
 * - `customHeaderNames`       — custom headers that must be present (name only).
 * - `customHeaderMatches`     — custom headers that must be present with a matching value.
 *
 * Header rules only participate in *full* detection (they need a per-message header read); the two
 * flow-based rules also run in cheap, list-facing detection.
 */
export const frameworkDetectionSchema = z.object({
  integrationFlowPatterns: z.array(regexSourceSchema).default([]),
  correlationFlowNames: z.array(z.string().min(1)).default([]),
  customHeaderNames: z.array(z.string().min(1)).default([]),
  customHeaderMatches: z.array(headerMatchSchema).default([]),
});

/**
 * A framework's queue topology — the ordered probe sequence plus which queues are active-processing
 * queues and which are dead-letter queues, and where each dead-letter queue's messages are moved
 * back to before being retried.
 *
 * - `traversalOrder`   — the exact order {@link module:../../operations/recovery/QueueRecoveryStrategyBase}
 *   probes queues in when locating a message. First hit wins; exhausting the list means the message
 *   is not on any of this framework's queues (Manual Investigation).
 * - `activeQueues`     — queues a message can be retried from directly, no move needed.
 * - `deadLetterQueues` — queues a message must be moved *out of* before it can be retried.
 * - `dlqRecoveryMap`   — dead-letter queue → the active queue it recovers to. Every entry in
 *   `deadLetterQueues` must have a mapping, and every mapping target must be an `activeQueues`
 *   entry — both enforced below, so a half-configured topology fails at boot rather than at 2am.
 */
export const frameworkTopologySchema = z.object({
  traversalOrder: z.array(z.string().min(1)).default([]),
  activeQueues: z.array(z.string().min(1)).default([]),
  deadLetterQueues: z.array(z.string().min(1)).default([]),
  dlqRecoveryMap: z.record(z.string(), z.string().min(1)).default({}),
});

/**
 * Header-derived queue resolution — currently only the JMS Framework, whose egress bridge iFlow
 * resolves the target queue at runtime and writes it into an MPL custom header. That header value is
 * the **authoritative** queue mapping for those messages (it beats any static topology), which is why
 * this is a distinct concept from {@link frameworkTopologySchema}.
 *
 * - `headerName`              — the custom header carrying the resolved queue.
 * - `headerValuePattern`      — regex whose **first capture group** is the bare queue name. The real
 *   header value is decorated, e.g.
 *   `📁 [PD Fetch Queue] Queue resolved via Direct Value [QUEUE_JMS_{RouteKey} = Common_JMS_ID_Ecom_P1]`.
 * - `centralDeadLetterQueue`  — the single fixed DLQ these messages fall back to when they are not on
 *   their resolved queue.
 */
export const frameworkQueueResolutionSchema = z.object({
  headerName: z.string().min(1),
  headerValuePattern: regexSourceSchema,
  centralDeadLetterQueue: z.string().min(1),
});

/**
 * Schema for a single framework entry in `config/frameworks.json`.
 *
 * - `id`        — one of {@link CONFIGURABLE_FRAMEWORK_IDS}.
 * - `label`     — operator-facing display name (the Message Investigation "Processing Framework" column).
 * - `enabled`   — a disabled framework is skipped entirely by detection; its messages fall through to
 *                 `UNKNOWN`/`NON_FRAMEWORK` rather than being silently attributed.
 * - `priority`  — resolution order when more than one framework's rules match (1 = evaluated first).
 *                 Ties are impossible: duplicate priorities are rejected below, so detection is
 *                 deterministic rather than dependent on JSON key order.
 */
export const frameworkSchema = z
  .object({
    id: z.enum(CONFIGURABLE_FRAMEWORK_IDS),
    label: z.string().min(1),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(1),
    detect: frameworkDetectionSchema.default({}),
    topology: frameworkTopologySchema.default({}),
    queueResolution: frameworkQueueResolutionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const active = new Set(value.topology.activeQueues);
    const dead = new Set(value.topology.deadLetterQueues);

    for (const queueName of dead) {
      const target = value.topology.dlqRecoveryMap[queueName];
      if (target === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `framework "${value.id}": dead-letter queue "${queueName}" has no dlqRecoveryMap entry — a message parked there would have nowhere to be moved back to`,
          path: ["topology", "dlqRecoveryMap"],
        });
      }
    }

    for (const [dlqName, target] of Object.entries(value.topology.dlqRecoveryMap)) {
      if (!dead.has(dlqName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `framework "${value.id}": dlqRecoveryMap key "${dlqName}" is not listed in deadLetterQueues`,
          path: ["topology", "dlqRecoveryMap"],
        });
      }
      if (!active.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `framework "${value.id}": dlqRecoveryMap target "${target}" is not listed in activeQueues`,
          path: ["topology", "dlqRecoveryMap"],
        });
      }
    }

    for (const queueName of value.topology.traversalOrder) {
      if (!active.has(queueName) && !dead.has(queueName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `framework "${value.id}": traversalOrder entry "${queueName}" is neither an active nor a dead-letter queue`,
          path: ["topology", "traversalOrder"],
        });
      }
    }
  });

/**
 * Schema for `config/frameworks.json` — the processing-framework registry backing framework detection
 * (`operations/engines/FrameworkDetectionEngine`) and the recovery strategies
 * (`operations/recovery/`). Duplicate ids and duplicate priorities are both rejected at boot so
 * detection order is always deterministic.
 */
export const frameworksSchema = z
  .object({
    frameworks: z.array(frameworkSchema),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const priorities = new Set<number>();
    for (const framework of value.frameworks) {
      if (ids.has(framework.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate framework id "${framework.id}"`,
          path: ["frameworks"],
        });
      }
      ids.add(framework.id);
      if (priorities.has(framework.priority)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate framework priority ${framework.priority} (on "${framework.id}") — detection order would be ambiguous`,
          path: ["frameworks"],
        });
      }
      priorities.add(framework.priority);
    }
  });

/** Typed view of one framework entry. */
export type FrameworkConfig = z.infer<typeof frameworkSchema>;

/** Typed view of one framework's detection rules. */
export type FrameworkDetectionRules = z.infer<typeof frameworkDetectionSchema>;

/** Typed view of one framework's queue topology. */
export type FrameworkTopology = z.infer<typeof frameworkTopologySchema>;

/** Typed view of a framework's header-derived queue resolution. */
export type FrameworkQueueResolution = z.infer<typeof frameworkQueueResolutionSchema>;

/** Typed view of `config/frameworks.json`. */
export type FrameworksConfig = z.infer<typeof frameworksSchema>;
