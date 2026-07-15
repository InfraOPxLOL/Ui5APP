import type { ClientLoggingConfig } from "../types/AppConfig";

/**
 * Severity levels for client-side log entries, ordered from least to most severe. `critical` is
 * reserved for conditions that break the whole app (bootstrap failure, unrecoverable state) — not
 * for ordinary request errors.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

/** Numeric ranks for level comparison (higher = more severe). */
const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
};

/** A single buffered client log entry. */
interface ClientLogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly category?: string;
  readonly correlationId?: string;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;
}

/**
 * A lightweight logger bound to a category (and optionally a correlation id). Obtained via
 * {@link ClientLogger.getLogger}; every frontend service/module should log through its own
 * category logger so entries are filterable by subsystem, mirroring the backend's category
 * loggers.
 */
export interface CategoryLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  critical(message: string, context?: Record<string, unknown>): void;
  /** @returns a logger with the same category and the given correlation id bound. */
  withCorrelationId(correlationId: string): CategoryLogger;
}

/**
 * The client-side logging framework.
 *
 * Entries at or above the configured ship level (default `warn`) are buffered and periodically
 * flushed to the backend (`POST /api/v1/client-logs`) so frontend problems land in the same
 * structured, correlation-tagged log stream as backend requests (architecture §10) — never
 * stranded in a browser console. Entries below the ship level are echoed to the console only.
 *
 * Configuration (`config/logging.json` → `client`) is applied via {@link ClientLogger.configure}
 * during bootstrap; conservative defaults apply before that so logging works from the first line
 * of code. Uses `fetch` directly rather than the ApiClient to avoid a dependency cycle (the
 * ApiClient logs through this framework).
 */
export default class ClientLogger {
  private static instance: ClientLogger | undefined;

  private readonly buffer: ClientLogEntry[] = [];
  private readonly flushEndpoint = "/api/v1/client-logs";
  private shipLevel: LogLevel = "warn";
  private maxBuffer = 50;
  private flushIntervalMs = 10000;
  private timerId: number | undefined;

  private constructor() {
    this.scheduleFlush();
  }

  /**
   * @returns the process-wide singleton logger instance.
   */
  public static getInstance(): ClientLogger {
    ClientLogger.instance ??= new ClientLogger();
    return ClientLogger.instance;
  }

  /**
   * Creates a category logger bound to a subsystem name.
   * @param category the subsystem/module name (e.g. `messageMonitoring`, `websocket`).
   * @returns a category logger delegating to the singleton.
   */
  public static getLogger(category: string): CategoryLogger {
    return ClientLogger.getInstance().createCategoryLogger(category, undefined);
  }

  /**
   * Applies the client-logging configuration (ship level, buffer size, flush cadence). Called once
   * during bootstrap after the configuration is loaded; restarts the flush timer.
   * @param config the client-logging configuration from the config service.
   */
  public configure(config: ClientLoggingConfig): void {
    if (ClientLogger.isLogLevel(config.shipLevel)) {
      this.shipLevel = config.shipLevel;
    }
    this.maxBuffer = config.maxBufferEntries;
    this.flushIntervalMs = config.flushIntervalMs;
    this.scheduleFlush();
  }

  /** Logs a debug message. */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.record("debug", message, undefined, undefined, context);
  }

  /** Logs an informational message. */
  public info(message: string, context?: Record<string, unknown>): void {
    this.record("info", message, undefined, undefined, context);
  }

  /** Logs a warning. */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.record("warn", message, undefined, undefined, context);
  }

  /** Logs an error. */
  public error(message: string, context?: Record<string, unknown>): void {
    this.record("error", message, undefined, undefined, context);
  }

  /** Logs a critical, app-breaking condition. Always shipped, flushed immediately. */
  public critical(message: string, context?: Record<string, unknown>): void {
    this.record("critical", message, undefined, undefined, context);
  }

  /**
   * Flushes the buffer to the backend. Failures are swallowed — best-effort telemetry must never
   * break the app or recurse into itself.
   */
  public async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await fetch(this.flushEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
        keepalive: true,
      });
    } catch {
      // Intentionally ignored: telemetry is best-effort and must not surface errors.
    }
  }

  private createCategoryLogger(
    category: string,
    correlationId: string | undefined,
  ): CategoryLogger {
    const record = (level: LogLevel, message: string, context?: Record<string, unknown>): void =>
      this.record(level, message, category, correlationId, context);
    return {
      debug: (message, context) => record("debug", message, context),
      info: (message, context) => record("info", message, context),
      warn: (message, context) => record("warn", message, context),
      error: (message, context) => record("error", message, context),
      critical: (message, context) => record("critical", message, context),
      withCorrelationId: (id: string) => this.createCategoryLogger(category, id),
    };
  }

  private record(
    level: LogLevel,
    message: string,
    category: string | undefined,
    correlationId: string | undefined,
    context: Record<string, unknown> | undefined,
  ): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.shipLevel]) {
      const consoleFn = level === "debug" ? console.debug : console.info;
      consoleFn(category !== undefined ? `[${category}] ${message}` : message, context ?? "");
      return;
    }
    this.buffer.push({
      level,
      message,
      category,
      correlationId,
      timestamp: new Date().toISOString(),
      context,
    });
    if (level === "critical" || this.buffer.length >= this.maxBuffer) {
      void this.flush();
    }
  }

  private scheduleFlush(): void {
    if (this.timerId !== undefined) {
      window.clearInterval(this.timerId);
    }
    this.timerId = window.setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  private static isLogLevel(value: string): value is LogLevel {
    return value in LEVEL_RANK;
  }
}
