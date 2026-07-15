import {
  DateTimeFormatter,
  DurationFormatter,
  SizeFormatter,
  StatusFormatter,
} from "../../core/formatters";

/**
 * Binding-facing formatter surface for the Administration module views. Delegates to the centralized
 * formatter library so formatting stays defined in exactly one place; exposed as instance-bindable
 * static references for any custom cells the module renders outside {@link ConfigurableTable}.
 */
export default class AdministrationFormatter {
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
}
