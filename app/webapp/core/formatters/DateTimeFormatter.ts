import DateFormat from "sap/ui/core/format/DateFormat";

/**
 * Centralized date/time formatting. Every module renders timestamps through these functions so
 * formatting is uniform and locale-aware, and never inlined in a view or controller.
 */
export default class DateTimeFormatter {
  private static readonly dateTimeInstance = DateFormat.getDateTimeInstance({ style: "medium" });
  private static readonly relativeInstance = DateFormat.getDateTimeInstance({ relative: true });
  private static readonly dateInstance = DateFormat.getDateInstance({ style: "medium" });

  /**
   * Formats an ISO timestamp (or epoch millis) as a medium-style absolute date-time.
   * @param value ISO 8601 string, epoch milliseconds, or a Date; nullish yields an empty string.
   * @returns the formatted date-time, or `""` for nullish/invalid input.
   */
  public static formatDateTime(value: string | number | Date | null | undefined): string {
    const date = DateTimeFormatter.toDate(value);
    return date ? DateTimeFormatter.dateTimeInstance.format(date) : "";
  }

  /**
   * Formats a calendar date (no time). A plain `YYYY-MM-DD` is read as that day locally — not as
   * UTC midnight, which would show the previous day west of Greenwich.
   * @param value `YYYY-MM-DD`, an ISO timestamp, epoch milliseconds, or a Date.
   * @returns the formatted date, or `""` for nullish/invalid input.
   */
  public static formatDate(value: string | number | Date | null | undefined): string {
    const plain = typeof value === "string" ? /^(d{4})-(d{2})-(d{2})$/.exec(value) : null;
    const date =
      plain === null
        ? DateTimeFormatter.toDate(value)
        : new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
    return date ? DateTimeFormatter.dateInstance.format(date) : "";
  }

  /**
   * Formats a timestamp relative to now (e.g. "5 minutes ago").
   * @param value ISO 8601 string, epoch milliseconds, or a Date.
   * @returns the relative representation, or `""` for nullish/invalid input.
   */
  public static formatRelative(value: string | number | Date | null | undefined): string {
    const date = DateTimeFormatter.toDate(value);
    return date ? DateTimeFormatter.relativeInstance.format(date) : "";
  }

  private static toDate(value: string | number | Date | null | undefined): Date | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
