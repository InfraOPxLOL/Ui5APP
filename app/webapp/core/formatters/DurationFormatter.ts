/**
 * Centralized duration formatting for elapsed processing times and latencies.
 */
export default class DurationFormatter {
  /**
   * Formats a millisecond duration into a compact human-readable string (e.g. "1m 30s", "250ms").
   * @param millis duration in milliseconds; nullish or negative yields an empty string.
   * @returns the formatted duration, or `""` for invalid input.
   */
  public static formatMillis(millis: number | null | undefined): string {
    if (millis === null || millis === undefined || millis < 0) {
      return "";
    }
    if (millis < 1000) {
      return `${Math.round(millis)}ms`;
    }
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds}s`);
    }
    return parts.join(" ");
  }

  /**
   * Formats the elapsed time between two timestamps.
   * @param startIso start timestamp (ISO 8601 or epoch millis).
   * @param endIso end timestamp (ISO 8601 or epoch millis); defaults to now.
   * @returns the formatted elapsed duration, or `""` for invalid input.
   */
  public static formatElapsed(
    startIso: string | number | null | undefined,
    endIso: string | number | null | undefined = Date.now(),
  ): string {
    if (startIso === null || startIso === undefined) {
      return "";
    }
    const start = new Date(startIso).getTime();
    const end = new Date(endIso ?? Date.now()).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return "";
    }
    return DurationFormatter.formatMillis(end - start);
  }
}
