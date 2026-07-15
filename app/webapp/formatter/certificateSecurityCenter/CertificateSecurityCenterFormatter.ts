import { DateTimeFormatter, HealthFormatter } from "../../core/formatters";

/**
 * Pure formatting helpers for the Certificate & Security Center. `health` reuses the shared
 * `core/formatters/HealthFormatter` vocabulary (healthy/warning/critical) verbatim; risk score,
 * self-signed/weak-algorithm heuristics, security-material availability and timeline-event
 * vocabulary are specific to this module and formatted here instead.
 */
export default class CertificateSecurityCenterFormatter {
  /** Maps a `HealthStatus` to a UI5 value state. Delegates to the shared formatter library. */
  public static healthState(health: string): string {
    return HealthFormatter.healthState(health);
  }

  /** Maps a `HealthStatus` to an icon. Delegates to the shared formatter library. */
  public static healthIcon(health: string): string {
    return HealthFormatter.healthIcon(health);
  }

  /** Maps a 0–100 risk score to a UI5 value state (high risk is bad, unlike a health score). */
  public static riskScoreState(riskScore: number): string {
    if (riskScore >= 70) {
      return "Error";
    }
    if (riskScore >= 35) {
      return "Warning";
    }
    return "Success";
  }

  /** Renders the self-signed heuristic as a display string, honestly reflecting "unknown" when undetermined. */
  public static selfSignedText(selfSigned: boolean | undefined): string {
    if (selfSigned === undefined) {
      return "Unknown";
    }
    return selfSigned ? "Yes" : "No";
  }

  /** Maps the self-signed heuristic to a UI5 value state. */
  public static selfSignedState(selfSigned: boolean | undefined): string {
    if (selfSigned === undefined) {
      return "None";
    }
    return selfSigned ? "Warning" : "Success";
  }

  /** Maps the weak-algorithm heuristic to a UI5 value state. */
  public static weakAlgorithmState(weakAlgorithm: boolean): string {
    return weakAlgorithm ? "Error" : "Success";
  }

  /** Maps a Security Material category's availability to a UI5 value state. */
  public static availabilityState(available: boolean): string {
    return available ? "Success" : "None";
  }

  /** Maps a Security Material category's availability to an icon. */
  public static availabilityIcon(available: boolean): string {
    return available ? "sap-icon://sys-enter-2" : "sap-icon://message-information";
  }

  /** Maps a `CertificateTimelineEventKind` to an icon. */
  public static timelineEventIcon(kind: string): string {
    switch (kind) {
      case "imported":
        return "sap-icon://add-document";
      case "expiring":
        return "sap-icon://alert";
      case "expired":
        return "sap-icon://error";
      case "flaggedForRenewal":
        return "sap-icon://flag";
      default:
        return "sap-icon://history";
    }
  }

  /** Maps a `CertificateTimelineEventKind` to a UI5 value state. */
  public static timelineEventState(kind: string): string {
    switch (kind) {
      case "expired":
        return "Error";
      case "expiring":
      case "flaggedForRenewal":
        return "Warning";
      default:
        return "None";
    }
  }

  /** Renders a "reserved / not available" placeholder text when a value is `undefined`. */
  public static reservedText(value: string | undefined): string {
    return value ?? "Not available";
  }

  /** Formats an ISO timestamp for display. */
  public static dateTime(value: string | undefined): string {
    return value === undefined ? "" : DateTimeFormatter.formatDateTime(value);
  }

  /** Formats an ISO timestamp as compact relative time. */
  public static relative(value: string | undefined): string {
    return value === undefined ? "" : DateTimeFormatter.formatRelative(value);
  }

  /** @returns whether a numeric count is greater than zero (for `visible` bindings). */
  public static hasItems(count: number): boolean {
    return count > 0;
  }
}
