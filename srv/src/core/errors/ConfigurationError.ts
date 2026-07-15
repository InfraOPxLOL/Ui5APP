import { AppError } from "./AppError.js";

/**
 * A configuration failure: a required file is missing, unreadable, or fails schema validation.
 *
 * Thrown during boot by the configuration framework — the process must terminate rather than start
 * with invalid configuration, so this error is marked non-operational (`isOperational = false`):
 * it signals a deployment fault, not a runtime condition to be handled.
 */
export class ConfigurationError extends AppError {
  public readonly statusCode: number = 500;
  public readonly code: string = "CONFIGURATION_ERROR";
  public override readonly isOperational: boolean = false;

  public constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, details, cause);
  }
}
