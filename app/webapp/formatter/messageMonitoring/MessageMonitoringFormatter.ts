import {
  DateTimeFormatter,
  DurationFormatter,
  SizeFormatter,
  StatusFormatter,
  HealthFormatter,
} from "../../core/formatters";
import {
  confidenceValueState,
  recoveryStateIcon,
  recoveryStateValueState,
} from "../../controller/messageMonitoring/RecoveryPathFormatter";

/**
 * Binding-facing formatter surface for the Message Investigation Workspace. Delegates to the
 * centralized formatter library (`core/formatters`) so date, duration, size, status, health and
 * severity formatting stays defined in exactly one place and reads identically to every other
 * Operations-DTO-consuming module.
 */
export default class MessageMonitoringFormatter {
  /** Formats an ISO timestamp as a medium-style absolute date-time. */
  public static readonly dateTime = DateTimeFormatter.formatDateTime;
  /** Formats an ISO timestamp relative to now. */
  public static readonly relative = DateTimeFormatter.formatRelative;
  /** Formats a millisecond duration. */
  public static readonly duration = DurationFormatter.formatMillis;
  /** Formats a byte size. */
  public static readonly size = SizeFormatter.formatBytes;
  /** Maps an MPL status to a semantic value state. */
  public static readonly messageState = StatusFormatter.messageStatusState;
  /** Maps a health status to a semantic value state. */
  public static readonly healthState = HealthFormatter.healthState;
  /** Maps a severity to a semantic value state. */
  public static readonly severityState = HealthFormatter.severityState;
  /** Maps a health status to a representative icon. */
  public static readonly healthIcon = HealthFormatter.healthIcon;
  /** Maps a severity to a representative icon. */
  public static readonly severityIcon = HealthFormatter.severityIcon;
  /**
   * Maps a recovery state to a semantic value state / icon (Phase 13). Delegates to the pure,
   * unit-tested {@link module:../../controller/messageMonitoring/RecoveryPathFormatter} rather than
   * duplicating the mapping, so the grid indicator and the Recovery tab can never disagree.
   */
  public static readonly recoveryStateState = recoveryStateValueState;
  public static readonly recoveryStateIcon = recoveryStateIcon;
  /** Maps a detection confidence to a semantic value state (`probable` is deliberately a warning). */
  public static readonly confidenceState = confidenceValueState;

  /**
   * Resolves a dynamic i18n key (health/insight titles sent by the backend) to display text.
   * @param key the i18n key, or `""`/`undefined` for no text.
   * @param resourceBundle the resource bundle to resolve against.
   * @returns the resolved text.
   */
  public static resolveKey(
    key: string | undefined,
    resourceBundle: { getText(key: string): string },
  ): string {
    return key === undefined || key === "" ? "" : resourceBundle.getText(key);
  }

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
}
