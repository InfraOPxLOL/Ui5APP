import { AppError } from "../../core/errors/AppError.js";

/**
 * The request could not reach the upstream host at all — DNS failure, connection refused, TLS
 * handshake failure, or the connection was reset. Distinct from {@link TimeoutError} (a connection
 * was established or attempted within budget, but no response arrived in time) and from
 * {@link UpstreamError}/{@link IntegrationSuiteError} (the upstream *did* respond, with an error
 * status).
 */
export class NetworkError extends AppError {
  public readonly statusCode: number = 503;
  public readonly code: string = "NETWORK_ERROR";

  public constructor(message = "The upstream host could not be reached.", cause?: unknown) {
    super(message, undefined, cause);
  }
}
