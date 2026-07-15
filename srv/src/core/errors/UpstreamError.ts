import { AppError } from "./AppError.js";

/**
 * Represents a failure originating from an upstream SAP Integration Suite API.
 *
 * CPI error shapes vary by API; this class normalizes any of them into the platform's stable error
 * taxonomy so the frontend never sees a raw CPI payload (architecture §9). Upstream 5xx are
 * surfaced as 502 Bad Gateway; upstream 4xx are echoed through where meaningful.
 */
export class UpstreamError extends AppError {
  public readonly statusCode: number;
  public readonly code: string = "UPSTREAM_ERROR";
  /** The HTTP status returned by the upstream CPI API. */
  public readonly upstreamStatus: number;

  public constructor(upstreamStatus: number, message: string, details?: unknown, cause?: unknown) {
    super(message, details, cause);
    this.upstreamStatus = upstreamStatus;
    this.statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
  }

  /**
   * Builds an {@link UpstreamError} from an upstream response.
   * @param status the upstream HTTP status.
   * @param body the (already-read) upstream response body, if any.
   * @returns a normalized upstream error.
   */
  public static fromResponse(status: number, body?: unknown): UpstreamError {
    return new UpstreamError(
      status,
      `The Integration Suite API responded with status ${status}.`,
      body,
    );
  }
}
