import { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./HttpTypes.js";

/** Outcome of a single attempt, as reported to the {@link RetryExecutor} by its caller. */
export interface AttemptOutcome<T> {
  /** The attempt's result, when it did not throw. */
  readonly result?: T;
  /** The HTTP status of the attempt's result, when applicable (used to decide retryability). */
  readonly status?: number;
  /** The error the attempt threw, when it failed before producing a status. */
  readonly error?: unknown;
  /** Whether this attempt should be retried (combines status/error with the retry policy). */
  readonly retryable: boolean;
}

/**
 * Executes an operation with retry and exponential backoff per a {@link RetryPolicy}.
 *
 * Framework-agnostic: it knows nothing about HTTP specifically. {@link FetchHttpClient} supplies an
 * attempt function that performs one HTTP call and classifies its own outcome (status code,
 * network error) into an {@link AttemptOutcome}; this executor only owns the *looping and
 * backoff* — so the same executor could retry an OData batch submission or a non-HTTP operation.
 */
export class RetryExecutor {
  /**
   * Runs `attempt` up to `policy.maxAttempts` times, waiting with exponential backoff between
   * retryable failures.
   * @param policy the retry policy (partial policies are merged over {@link DEFAULT_RETRY_POLICY}).
   * @param attempt performs one attempt and classifies its outcome; receives the 1-based attempt number.
   * @returns the outcome of the final attempt (successful, or the last failure if none succeeded).
   */
  public static async run<T>(
    policy: Partial<RetryPolicy> | undefined,
    attempt: (attemptNumber: number) => Promise<AttemptOutcome<T>>,
  ): Promise<AttemptOutcome<T> & { attempts: number }> {
    const resolved: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
    let outcome: AttemptOutcome<T> | undefined;

    for (let attemptNumber = 1; attemptNumber <= resolved.maxAttempts; attemptNumber += 1) {
      outcome = await attempt(attemptNumber);
      if (!outcome.retryable || attemptNumber === resolved.maxAttempts) {
        return { ...outcome, attempts: attemptNumber };
      }
      await RetryExecutor.delay(RetryExecutor.backoffDelay(resolved, attemptNumber));
    }
    // Unreachable when maxAttempts >= 1 (guaranteed by callers), but keeps the type checker honest.
    return { ...(outcome as AttemptOutcome<T>), attempts: resolved.maxAttempts };
  }

  /**
   * Classifies whether a status code is retryable under a policy.
   * @param policy the retry policy.
   * @param status the HTTP status code.
   * @returns whether the status is in the policy's retryable set.
   */
  public static isRetryableStatus(policy: RetryPolicy, status: number): boolean {
    return policy.retryableStatusCodes.includes(status);
  }

  private static backoffDelay(policy: RetryPolicy, attemptNumber: number): number {
    const raw = policy.baseDelayMs * Math.pow(policy.backoffFactor, attemptNumber - 1);
    return Math.min(raw, policy.maxDelayMs);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
