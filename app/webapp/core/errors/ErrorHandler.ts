import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import { AppError } from "./AppError";
import { UnknownError } from "./ErrorTypes";
import ClientLogger from "../logging/ClientLogger";

/**
 * Central error presentation service, wired once at shell bootstrap.
 *
 * It is the single place that decides how an error becomes visible to the user, based on the
 * error's {@link AppError.kind}:
 * - `VALIDATION` → non-blocking toast (inline handling is preferred; this is the fallback),
 * - `NETWORK` / `BACKEND` → toast surfacing the correlation id,
 * - `AUTH` → blocking dialog prompting re-authentication,
 * - `UNKNOWN` → blocking error dialog.
 *
 * Non-{@link AppError} throwables are wrapped in {@link UnknownError} so the rest of the pipeline
 * only ever deals with typed errors. Every handled error is also logged via {@link ClientLogger}.
 */
export default class ErrorHandler {
  private readonly logger = ClientLogger.getInstance();

  /**
   * Handles an arbitrary throwable: normalizes, logs, and presents it.
   * @param error the caught value (may be any thrown type).
   */
  public handle(error: unknown): void {
    const appError = this.normalize(error);
    this.logger.error(appError.message, {
      kind: appError.kind,
      code: appError.code,
      correlationId: appError.correlationId,
    });
    this.present(appError);
  }

  /**
   * Registers a global handler for unhandled promise rejections. Called once at bootstrap.
   */
  public registerGlobalHandlers(): void {
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      this.handle(event.reason);
      event.preventDefault();
    });
  }

  /**
   * Turns the backend's zod-issue `details` array into a concise, human-readable field hint so an
   * opaque "Request validation failed" becomes "…failed: rule.targetRouting.routeKey — String must
   * contain at least 1 character(s)". Defensive: returns "" for anything not shaped like zod issues,
   * and reports only the first issue (the field the user should fix first).
   */
  private static validationHint(details: unknown): string {
    if (!Array.isArray(details) || details.length === 0) {
      return "";
    }
    const first = details[0] as { path?: unknown; message?: unknown };
    const path =
      Array.isArray(first.path) && first.path.length > 0 ? first.path.join(".") : undefined;
    const message = typeof first.message === "string" ? first.message : undefined;
    if (path === undefined && message === undefined) {
      return "";
    }
    return `: ${[path, message].filter((part) => part !== undefined).join(" — ")}`;
  }

  private normalize(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new UnknownError(message, { cause: error });
  }

  private present(error: AppError): void {
    const suffix = error.correlationId !== "n/a" ? ` (Ref: ${error.correlationId})` : "";
    if (error.kind === "VALIDATION") {
      const hint = ErrorHandler.validationHint(error.details);
      MessageToast.show(error.message + hint + suffix, { duration: 6000 });
      return;
    }
    switch (error.kind) {
      case "AUTH":
        MessageBox.error(error.message + suffix, {
          title: "Session expired",
          onClose: () => window.location.reload(),
        });
        break;
      case "CONFIGURATION":
        // The app cannot proceed without valid configuration — blocking dialog, no reload loop.
        MessageBox.error(error.message + suffix, { title: "Configuration error" });
        break;
      case "UNKNOWN":
        MessageBox.error(error.message + suffix, { title: "Unexpected error" });
        break;
      case "NETWORK":
      case "AUTHORIZATION":
      case "BACKEND":
      case "INTEGRATION_SUITE":
      case "SERVICE":
      default:
        MessageToast.show(error.message + suffix, { duration: 6000 });
        break;
    }
  }
}
