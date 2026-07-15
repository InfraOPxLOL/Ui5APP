import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

/** The normalized error envelope returned for every non-2xx response. */
interface ErrorEnvelope {
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}

/**
 * Terminal error-handling middleware. The single place errors become HTTP responses.
 *
 * {@link AppError} instances map to their own status/code; anything else is treated as an
 * unexpected 500 whose message is not leaked to the client. Every response carries the correlation
 * id so a user-reported reference ties back to the logs.
 * @param error the thrown value.
 * @param req the request.
 * @param res the response.
 * @param _next unused (present so Express recognizes this as an error handler).
 */
export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.correlationId ?? "n/a";

  if (error instanceof AppError) {
    if (!error.isOperational) {
      req.log.error({ err: error }, "unhandled.operationalError");
    } else {
      req.log.warn({ code: error.code, err: error.message }, "request.failed");
    }
    const envelope: ErrorEnvelope = {
      code: error.code,
      message: error.message,
      correlationId,
      details: error.details,
    };
    res.status(error.statusCode).json(envelope);
    return;
  }

  req.log.error({ err: error }, "request.unhandledError");
  const envelope: ErrorEnvelope = {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    correlationId,
  };
  res.status(500).json(envelope);
}

/**
 * Wraps an async route handler so a rejected promise is forwarded to the error middleware instead
 * of crashing the process. Every async controller method is wrapped with this.
 * @param handler the async request handler.
 * @returns an Express-compatible handler that catches rejections.
 */
export function catchAsync(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
