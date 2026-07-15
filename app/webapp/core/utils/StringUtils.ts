/**
 * String manipulation utilities. Pure and side-effect free.
 */
export default class StringUtils {
  /**
   * @param value the string to test.
   * @returns whether the value is nullish, empty, or whitespace-only.
   */
  public static isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim() === "";
  }

  /**
   * Truncates a string to a maximum length, appending an ellipsis when cut.
   * @param value the input string.
   * @param maxLength maximum length of the result including the ellipsis.
   * @returns the truncated string.
   */
  public static truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return maxLength <= 1 ? value.slice(0, maxLength) : `${value.slice(0, maxLength - 1)}…`;
  }

  /**
   * Uppercases the first character.
   * @param value the input string.
   * @returns the capitalized string.
   */
  public static capitalize(value: string): string {
    return value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * Converts a camelCase identifier to space-separated words (`messageMonitoring` → `Message
   * Monitoring`).
   * @param value the camelCase identifier.
   * @returns the human-readable words.
   */
  public static camelToWords(value: string): string {
    return StringUtils.capitalize(value.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
  }

  /**
   * Converts a camelCase identifier to kebab-case (`messageMonitoring` → `message-monitoring`) —
   * the frontend↔backend module naming convention.
   * @param value the camelCase identifier.
   * @returns the kebab-case identifier.
   */
  public static camelToKebab(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * Converts a kebab-case identifier to camelCase (`message-monitoring` → `messageMonitoring`).
   * @param value the kebab-case identifier.
   * @returns the camelCase identifier.
   */
  public static kebabToCamel(value: string): string {
    return value.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  }

  /**
   * Escapes HTML-significant characters so untrusted text is safe to place into HTML content.
   * @param value the untrusted string.
   * @returns the escaped string.
   */
  public static escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Shortens a long technical id for display, keeping both ends (`AGh7…9fQx`).
   * @param value the id.
   * @param edge how many characters to keep on each side.
   * @returns the shortened id, or the input when already short enough.
   */
  public static shortenId(value: string, edge = 6): string {
    return value.length <= edge * 2 + 1 ? value : `${value.slice(0, edge)}…${value.slice(-edge)}`;
  }
}
