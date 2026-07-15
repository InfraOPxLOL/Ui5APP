import { ValueState } from "sap/ui/core/library";

/**
 * Binding-facing formatter surface for the Operations Workspace. Pure, stateless mappings from the
 * Operations DTO vocabulary (health / severity / timeline kind) to UI5 semantic colours, icons and
 * human-readable relative time. Keeping every such mapping here means health, severity and time read
 * identically across every widget, timeline row and interface card.
 */
export default class OperationsFormatter {
  private static readonly MINUTE = 60_000;
  private static readonly HOUR = 3_600_000;
  private static readonly DAY = 86_400_000;

  /**
   * Maps an Operations Engine health status to a UI5 value state.
   * @param health `healthy` | `warning` | `critical`.
   * @returns the corresponding {@link ValueState}.
   */
  public static healthState(health: string): ValueState {
    switch (health) {
      case "healthy":
        return ValueState.Success;
      case "warning":
        return ValueState.Warning;
      case "critical":
        return ValueState.Error;
      default:
        return ValueState.None;
    }
  }

  /**
   * Maps an Operations Engine severity to a UI5 value state.
   * @param severity `info` | `warning` | `error` | `critical`.
   * @returns the corresponding {@link ValueState}.
   */
  public static severityState(severity: string): ValueState {
    switch (severity) {
      case "critical":
      case "error":
        return ValueState.Error;
      case "warning":
        return ValueState.Warning;
      case "info":
        return ValueState.Information;
      default:
        return ValueState.None;
    }
  }

  /**
   * @param health the health status.
   * @returns a representative SAP icon URI.
   */
  public static healthIcon(health: string): string {
    switch (health) {
      case "healthy":
        return "sap-icon://sys-enter-2";
      case "warning":
        return "sap-icon://alert";
      case "critical":
        return "sap-icon://error";
      default:
        return "sap-icon://question-mark";
    }
  }

  /**
   * @param kind the timeline event kind.
   * @returns a representative SAP icon URI for the timeline row.
   */
  public static timelineIcon(kind: string): string {
    switch (kind) {
      case "failure":
        return "sap-icon://error";
      case "recovery":
        return "sap-icon://sys-enter-2";
      case "deployment":
        return "sap-icon://upload-to-cloud";
      case "alert":
        return "sap-icon://bell";
      case "runtime":
        return "sap-icon://pulse";
      case "queue":
        return "sap-icon://combine";
      case "certificate":
        return "sap-icon://key";
      default:
        return "sap-icon://circle-task-2";
    }
  }

  /**
   * @param severity the timeline event severity.
   * @returns the sap.m timeline group/indicator colour name.
   */
  public static severityIndication(severity: string): string {
    switch (severity) {
      case "critical":
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      default:
        return "Information";
    }
  }

  /**
   * Computes a percentage, clamped to 0–100.
   * @param value the numerator.
   * @param total the denominator.
   * @returns the percentage (0 when total is 0).
   */
  public static percent(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  /**
   * Formats an ISO timestamp as a compact relative time ("just now", "5m ago", "2h ago", "3d ago").
   * @param iso the ISO 8601 timestamp; empty/invalid input yields an empty string.
   * @returns the relative time string.
   */
  public static relativeTime(iso: string): string {
    if (iso === "" || iso === undefined) {
      return "";
    }
    const then = Date.parse(iso);
    if (Number.isNaN(then)) {
      return "";
    }
    const deltaMs = Date.now() - then;
    if (deltaMs < OperationsFormatter.MINUTE) {
      return "just now";
    }
    if (deltaMs < OperationsFormatter.HOUR) {
      return `${Math.floor(deltaMs / OperationsFormatter.MINUTE)}m ago`;
    }
    if (deltaMs < OperationsFormatter.DAY) {
      return `${Math.floor(deltaMs / OperationsFormatter.HOUR)}h ago`;
    }
    return `${Math.floor(deltaMs / OperationsFormatter.DAY)}d ago`;
  }

  /**
   * @param count a numeric count.
   * @returns whether the count is greater than zero (for `visible` bindings).
   */
  public static hasItems(count: number): boolean {
    return count > 0;
  }
}
