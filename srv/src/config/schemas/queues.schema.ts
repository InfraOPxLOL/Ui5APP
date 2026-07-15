import { z } from "zod";

/**
 * The supported retry strategies for a JMS queue. Consumed later by the JMS Retry Center; declared
 * here so queue configuration is validated against the closed set at boot.
 *
 * - `immediate`           — failed messages are re-enqueued for instant retry.
 * - `fixed-interval`      — retries occur at a constant interval.
 * - `exponential-backoff` — retry interval doubles per attempt.
 * - `manual`              — no automatic retry; an operator triggers replay explicitly.
 */
export const RETRY_STRATEGIES = [
  "immediate",
  "fixed-interval",
  "exponential-backoff",
  "manual",
] as const;

/** Union of the supported retry strategies. */
export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];

/**
 * Schema for a single queue entry in `config/queues.json`.
 *
 * Properties:
 * - `name`            — physical JMS queue name on the tenant. Never hardcoded elsewhere.
 * - `displayName`     — label rendered in the UI.
 * - `description`     — free-text purpose of the queue.
 * - `deadLetterQueue` — physical DLQ name paired with this queue.
 * - `retryQueue`      — physical retry queue name paired with this queue.
 * - `priority`        — ordering weight in operational views (1 = highest).
 * - `enabled`         — disabled queues are hidden from operational tooling.
 * - `retryStrategy`   — one of {@link RETRY_STRATEGIES}.
 * - `maxRetries`      — automatic retry ceiling before a message is parked in the DLQ
 *                       (0 with strategy `manual`).
 */
export const queueSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().default(""),
    deadLetterQueue: z.string().min(1),
    retryQueue: z.string().min(1),
    priority: z.number().int().min(1),
    enabled: z.boolean().default(true),
    retryStrategy: z.enum(RETRY_STRATEGIES),
    maxRetries: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.retryStrategy === "manual" && value.maxRetries !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `queue "${value.name}": maxRetries must be 0 when retryStrategy is "manual"`,
        path: ["maxRetries"],
      });
    }
  });

/**
 * Schema for `config/queues.json`. Duplicate queue names are rejected at boot.
 */
export const queuesSchema = z
  .object({
    queues: z.array(queueSchema),
  })
  .superRefine((value, ctx) => {
    const names = new Set<string>();
    for (const queue of value.queues) {
      if (names.has(queue.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate queue name "${queue.name}"`,
          path: ["queues"],
        });
      }
      names.add(queue.name);
    }
  });

/** Typed view of a single queue entry. */
export type QueueConfig = z.infer<typeof queueSchema>;

/** Typed view of `config/queues.json`. */
export type QueuesConfig = z.infer<typeof queuesSchema>;
