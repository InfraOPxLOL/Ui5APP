/**
 * Client-side input validation utilities for form fields and filter inputs. Pure predicates only —
 * these gate UI affordances; the backend re-validates every request at its boundary (the security
 * boundary is always server-side).
 */
export default class ValidationUtils {
  /**
   * @param value the string to test.
   * @returns whether the value is non-nullish and not whitespace-only.
   */
  public static isNonEmpty(value: string | null | undefined): value is string {
    return value !== null && value !== undefined && value.trim() !== "";
  }

  /**
   * @param value the candidate URL.
   * @returns whether the value parses as an absolute http(s) URL.
   */
  public static isUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * @param value the candidate email address.
   * @returns whether the value has a plausible email shape (pragmatic check, not RFC 5322).
   */
  public static isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  /**
   * @param value the number to test.
   * @param min inclusive lower bound.
   * @param max inclusive upper bound.
   * @returns whether the value is a finite number within the bounds.
   */
  public static inRange(value: number, min: number, max: number): boolean {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  /**
   * @param value the string to test.
   * @param pattern the regular expression the whole string must match.
   * @returns whether the entire value matches the pattern.
   */
  public static matches(value: string, pattern: RegExp): boolean {
    const anchored = new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace("g", ""));
    return anchored.test(value);
  }

  /**
   * @param value the candidate integer string.
   * @returns whether the value is a plain non-negative integer literal.
   */
  public static isNonNegativeInteger(value: string): boolean {
    return /^\d+$/.test(value);
  }
}
