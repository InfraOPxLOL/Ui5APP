/**
 * The normalized shape of an error returned by any Integration Suite API, before translation into
 * a typed application error (see `sdk/errors/HttpErrorTranslator`). Distinct upstream error bodies
 * (OData `error.message.value`, plain REST `{message}`, HTML error pages) are all normalized into
 * this shape at the transport boundary so nothing above it branches on upstream error format.
 */
export interface ErrorResponse {
  /** HTTP status code returned by the upstream call. */
  readonly httpStatus: number;
  /** Upstream-provided machine-readable error code, when one was present. */
  readonly upstreamCode?: string;
  /** Human-readable error message (upstream-provided, or a synthesized fallback). */
  readonly message: string;
  /** Raw upstream error body, retained for diagnostics (never shown to end users directly). */
  readonly rawBody?: unknown;
}
