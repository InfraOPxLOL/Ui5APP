import { ValueState } from "sap/ui/core/library";

/**
 * Alert / health severity levels used across Alert Notification, Dashboard and Live Monitoring.
 * A single mapping to {@link sap.ui.core.ValueState} guarantees consistent colouring everywhere a
 * severity is rendered.
 */
export const Severity = {
  Critical: "CRITICAL",
  Error: "ERROR",
  Warning: "WARNING",
  Info: "INFO",
} as const;

/** Union of all severity values. */
export type SeverityValue = (typeof Severity)[keyof typeof Severity];

/**
 * Maps a severity to a UI5 semantic {@link sap.ui.core.ValueState}.
 * @param severity the severity value.
 * @returns the corresponding value state; defaults to `None` for unknown input.
 */
export function severityToValueState(severity: SeverityValue): ValueState {
  switch (severity) {
    case Severity.Critical:
    case Severity.Error:
      return ValueState.Error;
    case Severity.Warning:
      return ValueState.Warning;
    case Severity.Info:
      return ValueState.Information;
    default:
      return ValueState.None;
  }
}
