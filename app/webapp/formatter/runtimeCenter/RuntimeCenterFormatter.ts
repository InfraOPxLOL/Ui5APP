import { DateTimeFormatter, DurationFormatter, HealthFormatter } from "../../core/formatters";

/**
 * Pure formatting helpers for the Runtime Center. Catalog/artifact `health` reuses the shared
 * `core/formatters/HealthFormatter` vocabulary (healthy/warning/critical) verbatim; failure
 * trend/deployment-event vocabulary is specific to this module and formatted here instead.
 */
export default class RuntimeCenterFormatter {
  /** Maps a `HealthStatus` to a UI5 value state. Delegates to the shared formatter library. */
  public static healthState(health: string): string {
    return HealthFormatter.healthState(health);
  }

  /** Maps a `HealthStatus` to an icon. Delegates to the shared formatter library. */
  public static healthIcon(health: string): string {
    return HealthFormatter.healthIcon(health);
  }

  /** Maps a message/alert `Severity` to a UI5 value state. Delegates to the shared formatter library. */
  public static severityState(severity: string): string {
    return HealthFormatter.severityState(severity);
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

  /** Maps a `FailureTrend` to an icon. */
  public static failureTrendIcon(trend: string): string {
    switch (trend) {
      case "increasing":
        return "sap-icon://trend-up";
      case "decreasing":
        return "sap-icon://trend-down";
      default:
        return "sap-icon://horizontal-bar-chart";
    }
  }

  /** Maps a `FailureTrend` to a UI5 value state (increasing failures is a warning, not healthy). */
  public static failureTrendState(trend: string): string {
    return trend === "increasing" ? "Warning" : "None";
  }

  /** Maps a `DeploymentEventKind` to an icon. */
  public static deploymentEventIcon(kind: string): string {
    return kind === "redeployed" ? "sap-icon://redo" : "sap-icon://shipping-status";
  }

  /** Maps a `DeploymentEventKind` to a UI5 value state. */
  public static deploymentEventState(kind: string): string {
    return kind === "redeployed" ? "Information" : "None";
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

  /** @returns whether a numeric count is greater than zero (for `visible` bindings). */
  public static hasItems(count: number): boolean {
    return count > 0;
  }
}
