import { z } from "zod";

/**
 * The log levels supported by the logging framework, least to most severe. `critical` maps to
 * pino's `fatal` on the backend and to a tagged error entry on the client.
 */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "critical"] as const;

/** Union of the supported log levels. */
export type ConfiguredLogLevel = (typeof LOG_LEVELS)[number];

/**
 * Schema for `config/logging.json` — logging framework configuration.
 *
 * Properties:
 * - `level`                  — minimum level emitted by the backend logger. The `LOG_LEVEL`
 *                              environment variable overrides this at runtime for ops use.
 * - `includeCorrelationId`   — whether request-scoped loggers bind the correlation id
 *                              (disable only for local noise reduction).
 * - `client.shipLevel`       — minimum level at which browser log entries are buffered and
 *                              shipped to the backend (below it: console only).
 * - `client.flushIntervalMs` — cadence at which the client log buffer is flushed.
 * - `client.maxBufferEntries`— buffer size that forces an early flush.
 * - `audit.enabled`          — whether sensitive actions emit structured audit log lines.
 */
export const loggingSchema = z.object({
  level: z.enum(LOG_LEVELS),
  includeCorrelationId: z.boolean().default(true),
  client: z.object({
    shipLevel: z.enum(LOG_LEVELS),
    flushIntervalMs: z.number().int().min(1000),
    maxBufferEntries: z.number().int().min(1),
  }),
  audit: z.object({
    enabled: z.boolean(),
  }),
});

/** Typed view of `config/logging.json`. */
export type LoggingConfig = z.infer<typeof loggingSchema>;
