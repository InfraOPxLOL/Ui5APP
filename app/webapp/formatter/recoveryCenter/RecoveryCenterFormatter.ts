import { DateTimeFormatter, DurationFormatter } from "../../core/formatters";

/**
 * Pure formatting helpers for the Recovery Center — the vocabulary here (readiness/consumer/growth
 * trend/recovery status) is specific to this module, so it doesn't fit the shared
 * `core/formatters/HealthFormatter` (healthy/warning/critical). Delegates date/duration formatting to
 * the shared core formatters so those still mean the same thing across every module.
 */
export default class RecoveryCenterFormatter {
  /** Maps a {@link module:../service/RecoveryCenterTypes.RecoveryReadiness} to a UI5 value state. */
  public static readinessState(readiness: string): string {
    switch (readiness) {
      case "ready":
        return "Success";
      case "blocked":
        return "Error";
      default:
        return "None";
    }
  }

  /** Maps a readiness to an icon. */
  public static readinessIcon(readiness: string): string {
    switch (readiness) {
      case "ready":
        return "sap-icon://sys-enter-2";
      case "blocked":
        return "sap-icon://error";
      default:
        return "sap-icon://question-mark";
    }
  }

  /** Maps a {@link module:../service/RecoveryCenterTypes.ConsumerStatus} to a UI5 value state. */
  public static consumerState(status: string): string {
    return status === "active" ? "Success" : "Warning";
  }

  /** Maps a {@link module:../service/RecoveryCenterTypes.QueueGrowthTrend} to an icon. */
  public static growthTrendIcon(trend: string): string {
    switch (trend) {
      case "growing":
        return "sap-icon://trend-up";
      case "shrinking":
        return "sap-icon://trend-down";
      default:
        return "sap-icon://horizontal-bar-chart";
    }
  }

  /** Maps a growth trend to a UI5 value state (growing backlog is a warning, not healthy). */
  public static growthTrendState(trend: string): string {
    return trend === "growing" ? "Warning" : "None";
  }

  /** Maps a numeric 0–100 health score to a UI5 value state. */
  public static healthScoreState(score: number): string {
    if (score >= 70) {
      return "Success";
    }
    if (score >= 40) {
      return "Warning";
    }
    return "Error";
  }

  /** Maps a {@link module:../service/RecoveryCenterTypes.RecoveryStatus} to a UI5 value state. */
  public static recoveryStatusState(status: string): string {
    switch (status) {
      case "completed":
        return "Success";
      case "failed":
        return "Error";
      case "cancelled":
        return "Warning";
      default:
        return "Information";
    }
  }

  /** Maps a recovery status to an icon. */
  public static recoveryStatusIcon(status: string): string {
    switch (status) {
      case "completed":
        return "sap-icon://sys-enter-2";
      case "failed":
        return "sap-icon://error";
      case "cancelled":
        return "sap-icon://cancel";
      default:
        return "sap-icon://process";
    }
  }

  /** Maps a validation check's pass/fail to a UI5 value state. */
  public static checkState(passed: boolean): string {
    return passed ? "Success" : "Error";
  }

  /** Maps a validation check's pass/fail to an icon. */
  public static checkIcon(passed: boolean): string {
    return passed ? "sap-icon://sys-enter-2" : "sap-icon://error";
  }

  /** Formats an ISO timestamp for display. */
  public static dateTime(value: string | undefined): string {
    return value === undefined ? "" : DateTimeFormatter.formatDateTime(value);
  }

  /** Formats an ISO timestamp as compact relative time. */
  public static relative(value: string | undefined): string {
    return value === undefined ? "" : DateTimeFormatter.formatRelative(value);
  }

  /** Formats a duration in milliseconds. */
  public static duration(millis: number | undefined): string {
    return DurationFormatter.formatMillis(millis);
  }

  /** Formats a message-age duration, or a dash when there is no parked message. */
  public static messageAge(millis: number | undefined): string {
    return millis === undefined ? "—" : DurationFormatter.formatMillis(millis);
  }

  /** @returns whether a numeric count is greater than zero (for `visible` bindings). */
  public static hasItems(count: number): boolean {
    return count > 0;
  }
}
