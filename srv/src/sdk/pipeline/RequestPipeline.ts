import type { IDestinationResolver } from "../destination/IDestinationResolver.js";
import type { TenantContext } from "../models/TenantContext.js";
import { createOperationContext, type OperationContext } from "../models/OperationContext.js";
import { createRequestContext } from "../models/RequestContext.js";
import type { CacheHooks } from "./CacheHooks.js";
import { AppError } from "../../core/errors/AppError.js";
import { ServiceError } from "../../core/errors/ServiceError.js";
import { getLogger } from "../../core/logging/logger.js";

/** Input to {@link RequestPipeline.run}. */
export interface RequestPipelineOptions<TInput, TResult> {
  /** Logical operation name for logging/metrics (e.g. `monitoring.queryMessageLogs`). */
  readonly operationName: string;
  /** Tenant to target; the default destination is used when omitted. */
  readonly tenantId?: string;
  /** Correlation id to propagate; generated when omitted. */
  readonly correlationId?: string;
  /** Identity of the caller, for audit/logging. */
  readonly actor?: string;
  /** Cancellation signal for the whole operation. */
  readonly signal?: AbortSignal;
  /** The operation's input, passed to `validate` when both are supplied. */
  readonly input?: TInput;
  /**
   * Validates `input` before any destination resolution or transport happens. Should throw (e.g.
   * `HttpError.validation(...)`) on invalid input.
   */
  readonly validate?: (input: TInput) => void;
  /** Optional caching hooks (see {@link CacheHooks}); checked before, populated after execution. */
  readonly cache?: CacheHooks<TResult>;
  /**
   * Performs the actual transport call(s) using the resolved tenant/operation context. Sub-clients
   * typically call into an `SdkRestClient`/OData query here.
   */
  readonly execute: (tenant: TenantContext, context: OperationContext) => Promise<TResult>;
}

/**
 * The SDK's request pipeline — the single orchestration point every provider/sub-client method
 * runs through (architecture: Request Pipeline, §7).
 *
 * Before the transport call: validates input, resolves the tenant's destination (base URL + live
 * auth headers, via {@link IDestinationResolver}), and assembles the {@link OperationContext}
 * (correlation id, actor, attempt bookkeeping). After the call: guarantees every thrown value is a
 * typed {@link AppError} (wrapping anything else as a {@link ServiceError} — the caller-supplied
 * `execute` and the HTTP layer normally already throw typed errors; this is the pipeline's own
 * safety net), logs the operation's total duration (distinct from the *per-HTTP-call* metrics the
 * `sdk/http` interceptors record, since one operation may issue several HTTP calls — e.g. a
 * paginated fetch or an OData batch), and reads/writes the optional cache.
 */
export class RequestPipeline {
  private readonly logger = getLogger("sdk.pipeline");

  public constructor(private readonly destinationResolver: IDestinationResolver) {}

  /**
   * Runs one operation through the pipeline.
   * @param options the operation's configuration and transport callback.
   * @returns the operation's result.
   * @throws {AppError} always a typed application error; unexpected throwables are wrapped.
   */
  public async run<TInput, TResult>(
    options: RequestPipelineOptions<TInput, TResult>,
  ): Promise<TResult> {
    const correlationId = options.correlationId ?? crypto.randomUUID();
    const startedAt = Date.now();

    if (options.validate !== undefined && options.input !== undefined) {
      options.validate(options.input);
    }

    if (options.cache !== undefined) {
      const cached = options.cache.read(options.cache.key);
      if (cached !== undefined) {
        this.logger.debug(
          { operation: options.operationName, correlationId, cacheKey: options.cache.key },
          "sdk.pipeline.cacheHit",
        );
        return cached;
      }
    }

    const tenant = await this.destinationResolver.resolve({
      tenantId: options.tenantId,
      correlationId,
    });

    const requestContext = createRequestContext(tenant.tenantId, {
      correlationId,
      actor: options.actor,
      signal: options.signal,
    });
    const operationContext = createOperationContext(requestContext, options.operationName);
    operationContext.tenant = tenant;
    operationContext.startedAt = startedAt;

    this.logger.debug(
      { operation: options.operationName, correlationId, tenantId: tenant.tenantId },
      "sdk.pipeline.start",
    );

    try {
      const result = await options.execute(tenant, operationContext);
      this.logger.info(
        {
          operation: options.operationName,
          correlationId,
          tenantId: tenant.tenantId,
          durationMs: Date.now() - startedAt,
        },
        "sdk.pipeline.complete",
      );
      options.cache?.write(options.cache.key, result);
      return result;
    } catch (error) {
      this.logger.warn(
        {
          operation: options.operationName,
          correlationId,
          tenantId: tenant.tenantId,
          durationMs: Date.now() - startedAt,
          err: error instanceof Error ? error.message : String(error),
        },
        "sdk.pipeline.failed",
      );
      throw RequestPipeline.ensureAppError(error);
    }
  }

  private static ensureAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new ServiceError(message, undefined, error);
  }
}
