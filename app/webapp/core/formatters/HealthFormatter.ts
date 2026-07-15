import { ValueState } from "sap/ui/core/library";

/**
 * Centralized mapping of the Operations Engine's `HealthStatus`/`Severity` vocabulary
 * (`healthy`/`warning`/`critical`, `info`/`warning`/`error`/`critical`) to UI5 semantic
 * {@link sap.ui.core.ValueState} and representative icons. Any module consuming Operations DTOs
 * (Operations Workspace, Message Investigation Workspace, and future workspaces) resolves health and
 * severity colouring here, once, rather than re-deriving the mapping per module.
 */
export default class HealthFormatter {
  /**
   * Maps a health status (`healthy`/`warning`/`critical`) to a UI5 value state.
   * @param health the health status.
   * @returns the corresponding value state.
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
   * Maps a severity (`info`/`warning`/`error`/`critical`) to a UI5 value state.
   * @param severity the severity.
   * @returns the corresponding value state.
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
   * @param severity the severity.
   * @returns a representative SAP icon URI.
   */
  public static severityIcon(severity: string): string {
    switch (severity) {
      case "critical":
        return "sap-icon://message-error";
      case "error":
        return "sap-icon://error";
      case "warning":
        return "sap-icon://alert";
      default:
        return "sap-icon://information";
    }
  }
}
