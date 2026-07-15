import { DateTimeFormatter } from "../../core/formatters";

/**
 * Binding-facing formatter surface for the DLQ & Intelligent Recovery Dashboard. Delegates to the
 * centralized formatter library (`core/formatters`) so date/time formatting stays defined in exactly
 * one place and reads identically to every other Operations-DTO-consuming module.
 */
export default class CoeDlqFormatter {
  /** Formats an ISO timestamp as a medium-style absolute date-time. */
  public static readonly dateTime = DateTimeFormatter.formatDateTime;
}
