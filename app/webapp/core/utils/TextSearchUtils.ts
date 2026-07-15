/** One match's character range within the searched text. */
export interface TextMatchRange {
  readonly start: number;
  readonly end: number;
}

/** Options controlling how {@link TextSearchUtils.findMatches} interprets the query. */
export interface TextSearchOptions {
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
  readonly regex?: boolean;
}

/** The result of a text search: every match found, in document order. */
export interface TextSearchResult {
  readonly matches: readonly TextMatchRange[];
  readonly count: number;
}

/**
 * Literal/whole-word/regex text search over an arbitrary string, returning match ranges rather than
 * highlighted markup (rendering is the caller's concern). Built for Payload Studio's payload search
 * (§ Search), but generic enough for any large-document search need. XPath/JSONPath search are
 * documented future capabilities (§ Search) — not implemented here.
 */
export default class TextSearchUtils {
  /**
   * Finds every match of a query within a text.
   * @param text the document to search.
   * @param query the search query (literal text, or a regex pattern when `options.regex` is true).
   * @param options search behaviour; all flags default to `false`.
   * @returns every match, in document order (empty when the query is empty or invalid).
   */
  public static findMatches(
    text: string,
    query: string,
    options: TextSearchOptions = {},
  ): TextSearchResult {
    if (query === "") {
      return { matches: [], count: 0 };
    }
    const pattern = TextSearchUtils.buildPattern(query, options);
    if (pattern === undefined) {
      return { matches: [], count: 0 };
    }
    const matches: TextMatchRange[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      matches.push({ start, end });
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
    return { matches, count: matches.length };
  }

  /**
   * Finds the next match strictly after a cursor position, wrapping to the first match when none
   * remain (Find Next, § Search).
   * @param matches the matches from {@link findMatches} (must be in document order).
   * @param afterIndex search forward from this character offset.
   * @returns the next match, or `undefined` when there are no matches at all.
   */
  public static findNext(
    matches: readonly TextMatchRange[],
    afterIndex: number,
  ): TextMatchRange | undefined {
    if (matches.length === 0) {
      return undefined;
    }
    return matches.find((m) => m.start > afterIndex) ?? matches[0];
  }

  /**
   * Finds the previous match strictly before a cursor position, wrapping to the last match when none
   * precede it (Find Previous, § Search).
   * @param matches the matches from {@link findMatches} (must be in document order).
   * @param beforeIndex search backward from this character offset.
   * @returns the previous match, or `undefined` when there are no matches at all.
   */
  public static findPrevious(
    matches: readonly TextMatchRange[],
    beforeIndex: number,
  ): TextMatchRange | undefined {
    if (matches.length === 0) {
      return undefined;
    }
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const candidate = matches[i];
      if (candidate !== undefined && candidate.start < beforeIndex) {
        return candidate;
      }
    }
    return matches[matches.length - 1];
  }

  /**
   * Resolves a 1-based line number to its character offset within the text (Go To Line, § Search).
   * @param text the document.
   * @param lineNumber the 1-based line number.
   * @returns the character offset of the line's first character, clamped to the text's bounds.
   */
  public static offsetOfLine(text: string, lineNumber: number): number {
    if (lineNumber <= 1) {
      return 0;
    }
    const lines = text.split("\n");
    const clamped = Math.min(lineNumber, lines.length) - 1;
    let offset = 0;
    for (let i = 0; i < clamped; i += 1) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return offset;
  }

  /** @param text the document. @returns the total number of lines (1 for an empty string). */
  public static lineCount(text: string): number {
    return text === "" ? 0 : text.split("\n").length;
  }

  private static buildPattern(query: string, options: TextSearchOptions): RegExp | undefined {
    const flags = options.caseSensitive === true ? "g" : "gi";
    try {
      if (options.regex === true) {
        return new RegExp(query, flags);
      }
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const source = options.wholeWord === true ? `\\b${escaped}\\b` : escaped;
      return new RegExp(source, flags);
    } catch {
      return undefined;
    }
  }
}
