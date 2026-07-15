/**
 * JSON parsing and formatting utilities. Pure; parsing never throws — callers branch on
 * `undefined` instead of wrapping try/catch around every parse site.
 */
export default class JsonUtils {
  /**
   * Parses JSON without throwing.
   * @param text the JSON text.
   * @returns the parsed value typed as `T`, or `undefined` when the text is not valid JSON.
   */
  public static safeParse<T = unknown>(text: string | null | undefined): T | undefined {
    if (text === null || text === undefined || text.trim() === "") {
      return undefined;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * @param text the candidate string.
   * @returns whether the string parses as JSON.
   */
  public static isJson(text: string | null | undefined): boolean {
    return JsonUtils.safeParse(text) !== undefined;
  }

  /**
   * Pretty-prints a JSON string (payload viewers). Invalid JSON is returned unchanged so the raw
   * payload is never hidden from the operator.
   * @param text the JSON text.
   * @param indent indentation width (default 2).
   * @returns the formatted JSON, or the input unchanged when not valid JSON.
   */
  public static prettyPrint(text: string, indent = 2): string {
    const parsed = JsonUtils.safeParse(text);
    return parsed === undefined ? text : JSON.stringify(parsed, null, indent);
  }

  /**
   * Serializes a value to stable, pretty JSON (exports, diffs).
   * @param value the value to serialize.
   * @param indent indentation width (default 2).
   * @returns the JSON string.
   */
  public static stringifyPretty(value: unknown, indent = 2): string {
    return JSON.stringify(value, null, indent);
  }

  /**
   * Reads a value at a dot-separated path (`"a.b.c"`) from a nested object.
   * @param source the object to read from.
   * @param path the dot-separated path.
   * @returns the value at the path, or `undefined` when any segment is missing.
   */
  public static getAtPath(source: unknown, path: string): unknown {
    let current: unknown = source;
    for (const segment of path.split(".")) {
      if (current === null || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  /**
   * Deep-clones a JSON-serializable value.
   * @param value the value to clone.
   * @returns an independent copy.
   */
  public static deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
