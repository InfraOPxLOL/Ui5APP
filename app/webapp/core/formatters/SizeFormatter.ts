/**
 * Centralized byte-size formatting for payload sizes.
 */
export default class SizeFormatter {
  private static readonly units = ["B", "KB", "MB", "GB", "TB"] as const;

  /**
   * Formats a byte count into a human-readable string using binary (1024) steps.
   * @param bytes size in bytes; nullish or negative yields an empty string.
   * @returns the formatted size (e.g. "1.5 MB"), or `""` for invalid input.
   */
  public static formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || bytes < 0) {
      return "";
    }
    if (bytes === 0) {
      return "0 B";
    }
    const exponent = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      SizeFormatter.units.length - 1,
    );
    const value = bytes / Math.pow(1024, exponent);
    const rounded = exponent === 0 ? value.toString() : value.toFixed(1);
    return `${rounded} ${SizeFormatter.units[exponent]}`;
  }
}
