import {
  DateTimeFormatter,
  DurationFormatter,
  SizeFormatter,
  HealthFormatter,
} from "../../core/formatters";

/**
 * Binding-facing formatter surface for Payload Studio. Delegates to the centralized formatter
 * library (`core/formatters`) so date/duration/size/severity formatting stays defined once and reads
 * identically to every other Operations-DTO-consuming module.
 */
export default class PayloadStudioFormatter {
  /** Formats an ISO timestamp as a medium-style absolute date-time. */
  public static readonly dateTime = DateTimeFormatter.formatDateTime;
  /** Formats an ISO timestamp relative to now. */
  public static readonly relative = DateTimeFormatter.formatRelative;
  /** Formats a millisecond duration. */
  public static readonly duration = DurationFormatter.formatMillis;
  /** Formats a byte size. */
  public static readonly size = SizeFormatter.formatBytes;
  /** Maps a severity to a semantic value state. */
  public static readonly severityState = HealthFormatter.severityState;

  /**
   * Maps a retry-status classification to a UI5 value state.
   * @param retryStatus `retryable` | `escalated` | `not-applicable`.
   * @returns the corresponding value state.
   */
  public static retryStatusState(retryStatus: string): string {
    switch (retryStatus) {
      case "retryable":
        return "Warning";
      case "escalated":
        return "Error";
      default:
        return "None";
    }
  }

  /**
   * Maps a payload source to a UI5 value state — `"unavailable"` is the only case worth calling
   * out visually (neither MPL nor Splunk had anything to show).
   * @param payloadSource `mpl` | `splunk` | `unavailable`.
   * @returns the corresponding value state.
   */
  public static payloadSourceState(payloadSource: string): string {
    return payloadSource === "unavailable" ? "Warning" : "None";
  }

  /**
   * Maps a payload format to a representative icon.
   * @param format `xml` | `json` | `text` | `binary`.
   * @returns the icon URI.
   */
  public static formatIcon(format: string): string {
    switch (format) {
      case "xml":
        return "sap-icon://display-more";
      case "json":
        return "sap-icon://syntax";
      case "binary":
        return "sap-icon://attachment";
      default:
        return "sap-icon://document-text";
    }
  }

  /**
   * Maps a validation issue severity to a UI5 value state.
   * @param severity `error` | `warning`.
   * @returns the corresponding value state.
   */
  public static validationSeverityState(severity: string): string {
    return severity === "error" ? "Error" : "Warning";
  }

  /**
   * Maps a diff line kind to a CSS-friendly indication name.
   * @param kind `equal` | `added` | `removed`.
   * @returns the indication name.
   */
  public static diffLineState(kind: string): string {
    switch (kind) {
      case "added":
        return "Success";
      case "removed":
        return "Error";
      default:
        return "None";
    }
  }
}
