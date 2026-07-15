/**
 * Date construction and arithmetic utilities. Pure and side-effect free; every module derives
 * query time windows and date boundaries through these instead of hand-rolling `Date` math.
 * (Formatting for display lives in `core/formatters`; patterns in `core/constants/DateFormats`.)
 */
export default class DateUtils {
  /**
   * Safely parses a value into a Date.
   * @param value ISO 8601 string, epoch milliseconds, or a Date.
   * @returns the parsed Date, or `undefined` for nullish/invalid input.
   */
  public static parse(value: string | number | Date | null | undefined): Date | undefined {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * @returns the current instant as an ISO 8601 string.
   */
  public static nowIso(): string {
    return new Date().toISOString();
  }

  /**
   * Adds a number of hours to a date (negative to subtract).
   * @param date the base date (not mutated).
   * @param hours hours to add.
   * @returns a new shifted Date.
   */
  public static addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 3_600_000);
  }

  /**
   * Adds a number of days to a date (negative to subtract).
   * @param date the base date (not mutated).
   * @param days days to add.
   * @returns a new shifted Date.
   */
  public static addDays(date: Date, days: number): Date {
    return DateUtils.addHours(date, days * 24);
  }

  /**
   * @param date the base date (not mutated).
   * @returns a new Date at 00:00:00.000 local time of the same day.
   */
  public static startOfDay(date: Date): Date {
    const result = new Date(date.getTime());
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Builds a look-back time window ending now — the shape every monitoring filter needs.
   * @param hours the window length in hours.
   * @returns `{ from, to }` where `to` is now and `from` is `hours` earlier.
   */
  public static lastHoursWindow(hours: number): { from: Date; to: Date } {
    const to = new Date();
    return { from: DateUtils.addHours(to, -hours), to };
  }

  /**
   * @param a first date.
   * @param b second date.
   * @returns whether both fall on the same local calendar day.
   */
  public static isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
