import pino, { type Logger } from "pino";
import { env } from "../../config/env.js";
import { configService } from "../../config/ConfigService.js";
import type { ConfiguredLogLevel } from "../../config/schemas/index.js";

/**
 * The backend logging framework (structured, pino-based).
 *
 * Design (architecture §10, Phase-3 platform mandate):
 * - One root logger; every emission is a single structured JSON line, shippable as-is to
 *   SAP Cloud Logging / Application Logging when that integration is wired (no code changes here —
 *   the transport is stdout, which the platform log drain consumes).
 * - The minimum level comes from `config/logging.json`; the `LOG_LEVEL` environment variable
 *   overrides it at runtime for operations.
 * - Levels: trace, debug, info, warn, error, **critical** (mapped to pino's `fatal`).
 * - **Category loggers** ({@link getLogger}) bind a `category` field so every subsystem's lines are
 *   filterable (`category: "jms-queue"`), and **request loggers** ({@link childLogger}) bind the
 *   correlation id so a request is traceable end to end.
 * - **Audit events** ({@link auditLog}) are ordinary log lines tagged `audit: true` — there is no
 *   separate audit store, consistent with the stateless-backend model. Toggled by
 *   `logging.json` → `audit.enabled`.
 */

/** Maps a configured level to the pino level name (`critical` → `fatal`). */
function toPinoLevel(level: ConfiguredLogLevel): string {
  return level === "critical" ? "fatal" : level;
}

/** The application's root structured logger. */
export const logger: Logger = pino({
  level: env.logLevel ?? toPinoLevel(configService.getLogging().level),
  base: { service: "integration-portal-srv" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label === "fatal" ? "critical" : label }),
  },
});

/**
 * Creates a category logger: a child logger with a bound `category` field. Every backend subsystem
 * and module service should log through its own category logger rather than the root.
 * @param category the subsystem/module name (e.g. `jms-queue`, `websocket`, `config`).
 * @returns a child logger tagged with the category.
 */
export function getLogger(category: string): Logger {
  return logger.child({ category });
}

/**
 * Creates a request-scoped logger with a bound correlation id (used by the correlation-id
 * middleware). When `logging.json` disables correlation ids, returns the root logger unchanged.
 * @param correlationId the request correlation id.
 * @returns a child logger carrying the correlation id.
 */
export function childLogger(correlationId: string): Logger {
  if (!configService.getLogging().includeCorrelationId) {
    return logger;
  }
  return logger.child({ correlationId });
}

/**
 * Logs a critical (highest-severity) event. Reserved for conditions that threaten the process or
 * the platform's ability to serve any request — not for ordinary request failures.
 * @param context structured fields to attach.
 * @param message the log message.
 */
export function critical(context: Record<string, unknown>, message: string): void {
  logger.fatal(context, message);
}

/**
 * Emits a structured audit log line for a sensitive action. No-op when auditing is disabled in
 * `logging.json`.
 * @param correlationId the request correlation id.
 * @param entry the audit details (actor, action, target, optional before/after).
 */
export function auditLog(
  correlationId: string,
  entry: {
    actor: string;
    action: string;
    target?: string;
    before?: unknown;
    after?: unknown;
  },
): void {
  if (!configService.getLogging().audit.enabled) {
    return;
  }
  logger.info({ audit: true, correlationId, ...entry }, `audit:${entry.action}`);
}
