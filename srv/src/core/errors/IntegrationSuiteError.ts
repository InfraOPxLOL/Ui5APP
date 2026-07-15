import { UpstreamError } from "./UpstreamError.js";

/**
 * A failure reported by an SAP Integration Suite API specifically.
 *
 * Specializes {@link UpstreamError} (which covers any upstream system) with a distinct stable code
 * and the tenant context, so operators can immediately tell *which* tenant's Integration Suite
 * call failed from the error envelope alone. Future provider implementations
 * (`core/providers/*`) throw this — never raw HTTP errors — keeping CPI error shapes contained.
 */
export class IntegrationSuiteError extends UpstreamError {
  public override readonly code: string = "INTEGRATION_SUITE_ERROR";

  /** The tenant against which the failing call was made. */
  public readonly tenantId: string;

  public constructor(
    tenantId: string,
    upstreamStatus: number,
    message: string,
    details?: unknown,
    cause?: unknown,
  ) {
    super(upstreamStatus, message, details, cause);
    this.tenantId = tenantId;
  }

  /**
   * Builds an {@link IntegrationSuiteError} from an upstream CPI response.
   * @param tenantId the tenant the call targeted.
   * @param status the upstream HTTP status.
   * @param body the (already-read) upstream response body, if any.
   * @returns a normalized Integration Suite error.
   */
  public static fromCpiResponse(
    tenantId: string,
    status: number,
    body?: unknown,
  ): IntegrationSuiteError {
    return new IntegrationSuiteError(
      tenantId,
      status,
      `The Integration Suite API for tenant "${tenantId}" responded with status ${status}.`,
      body,
    );
  }
}
