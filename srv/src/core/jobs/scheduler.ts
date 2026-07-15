import { logger } from "../logging/logger.js";

/** A registered periodic job. */
export interface ScheduledJob {
  /** Unique job name. */
  readonly name: string;
  /** Interval between runs, in milliseconds. */
  readonly intervalMs: number;
  /** The work to perform on each tick. */
  readonly run: () => Promise<void>;
}

/**
 * Minimal in-process periodic job scheduler.
 *
 * Registers interval-based jobs (e.g. the certificate-expiry sweep that polls CPI and pushes over
 * WebSocket). Timers live in process memory only; there is no persisted schedule or run history,
 * consistent with the stateless-backend constraint. On multi-instance deployments each instance
 * runs its own timers — acceptable for idempotent polling, and a note for any future job that must
 * run singleton.
 */
export class Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /**
   * Registers and starts a job.
   * @param job the job definition.
   */
  public register(job: ScheduledJob): void {
    if (this.timers.has(job.name)) {
      return;
    }
    const timer = setInterval(() => {
      job.run().catch((error: unknown) => {
        logger.error({ err: error, job: job.name }, "scheduled.jobFailed");
      });
    }, job.intervalMs);
    // Do not keep the event loop alive solely for jobs.
    timer.unref();
    this.timers.set(job.name, timer);
    logger.info({ job: job.name, intervalMs: job.intervalMs }, "scheduled.jobRegistered");
  }

  /**
   * Stops all registered jobs.
   */
  public stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}

/** Process-wide scheduler instance. */
export const scheduler = new Scheduler();
