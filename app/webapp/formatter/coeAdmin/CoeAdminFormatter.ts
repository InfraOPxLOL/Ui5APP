import { DateTimeFormatter } from "../../core/formatters";

/**
 * Binding-facing formatter surface for the CoE Admin workspace. Delegates to the centralized
 * formatter library (`core/formatters`) so date/time formatting stays defined in exactly one place
 * and reads identically to every other Operations-DTO-consuming module.
 */
export default class CoeAdminFormatter {
  /** Formats an ISO timestamp as a medium-style absolute date-time. */
  public static readonly dateTime = DateTimeFormatter.formatDateTime;
}
