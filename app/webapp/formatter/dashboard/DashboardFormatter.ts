import { DateTimeFormatter } from "../../core/formatters";

/**
 * Binding-facing formatter surface for the Dashboard module. Delegates to the centralized formatter
 * library.
 */
export default class DashboardFormatter {
  /** Formats an ISO timestamp as a medium-style absolute date-time. */
  public static readonly dateTime = DateTimeFormatter.formatDateTime;
}
