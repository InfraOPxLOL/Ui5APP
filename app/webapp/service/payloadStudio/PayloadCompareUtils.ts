/** One line's role in a comparison result. */
export type DiffLineKind = "equal" | "added" | "removed";

/** One line of a rendered comparison. */
export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  /** 1-based line number in the left (request) document; `undefined` for a purely-added line. */
  readonly leftLine: number | undefined;
  /** 1-based line number in the right (response) document; `undefined` for a purely-removed line. */
  readonly rightLine: number | undefined;
}

/** Summary counts for a comparison (§ Request/Response Comparison — "Difference summary"). */
export interface DiffSummary {
  readonly addedLines: number;
  readonly removedLines: number;
  readonly unchangedLines: number;
  readonly identical: boolean;
}

/** The full result of comparing two payloads. */
export interface DiffResult {
  readonly lines: readonly DiffLine[];
  readonly summary: DiffSummary;
  /** `true` when the inputs exceeded {@link MAX_DIFF_LINES} and were not diffed line-by-line. */
  readonly truncated: boolean;
}

/** Options controlling comparison (§ Request/Response Comparison). */
export interface DiffOptions {
  readonly ignoreWhitespace?: boolean;
}

/**
 * Line-based request/response payload comparison (§ Request/Response Comparison) — a classic
 * longest-common-subsequence diff, computed entirely client-side over two already-fetched payload
 * texts. Comparison *between two different messages* is a documented future capability (§ Request/
 * Response Comparison — "Future payload comparison between two messages"); this phase compares one
 * message's request against its own response.
 */
export default class PayloadCompareUtils {
  /** Bound on line count the LCS algorithm runs over (O(n·m) memory) — large payloads report `truncated` instead of hanging the tab. */
  private static readonly MAX_DIFF_LINES = 2000;

  /**
   * Compares two payload texts line-by-line.
   * @param left the request (left-hand) text.
   * @param right the response (right-hand) text.
   * @param options comparison options.
   * @returns the diff result.
   */
  public static compare(left: string, right: string, options: DiffOptions = {}): DiffResult {
    const leftLines = left.split("\n");
    const rightLines = right.split("\n");
    if (leftLines.length > this.MAX_DIFF_LINES || rightLines.length > this.MAX_DIFF_LINES) {
      return {
        lines: [],
        summary: { addedLines: 0, removedLines: 0, unchangedLines: 0, identical: left === right },
        truncated: true,
      };
    }

    const normalize = (line: string): string =>
      options.ignoreWhitespace === true ? line.replace(/\s+/g, " ").trim() : line;
    const normalizedLeft = leftLines.map(normalize);
    const normalizedRight = rightLines.map(normalize);

    const lcs = PayloadCompareUtils.longestCommonSubsequence(normalizedLeft, normalizedRight);
    const lines = PayloadCompareUtils.toDiffLines(
      leftLines,
      rightLines,
      normalizedLeft,
      normalizedRight,
      lcs,
    );
    const summary = PayloadCompareUtils.summarize(lines);
    return { lines, summary, truncated: false };
  }

  private static longestCommonSubsequence(left: string[], right: string[]): number[][] {
    const table: number[][] = Array.from({ length: left.length + 1 }, () =>
      new Array<number>(right.length + 1).fill(0),
    );
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        table[i]![j] =
          left[i] === right[j]
            ? (table[i + 1]![j + 1] ?? 0) + 1
            : Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0);
      }
    }
    return table;
  }

  /**
   * Backtracks the LCS table into per-line diff entries. Equality decisions use the **normalized**
   * lines (the same basis the LCS table was built on — so `ignoreWhitespace` is honoured
   * consistently), while the displayed `text` is always the **original** line.
   */
  private static toDiffLines(
    left: string[],
    right: string[],
    normLeft: string[],
    normRight: string[],
    lcs: number[][],
  ): DiffLine[] {
    const lines: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (normLeft[i] === normRight[j]) {
        lines.push({ kind: "equal", text: left[i] ?? "", leftLine: i + 1, rightLine: j + 1 });
        i += 1;
        j += 1;
      } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
        lines.push({ kind: "removed", text: left[i] ?? "", leftLine: i + 1, rightLine: undefined });
        i += 1;
      } else {
        lines.push({ kind: "added", text: right[j] ?? "", leftLine: undefined, rightLine: j + 1 });
        j += 1;
      }
    }
    while (i < left.length) {
      lines.push({ kind: "removed", text: left[i] ?? "", leftLine: i + 1, rightLine: undefined });
      i += 1;
    }
    while (j < right.length) {
      lines.push({ kind: "added", text: right[j] ?? "", leftLine: undefined, rightLine: j + 1 });
      j += 1;
    }
    return lines;
  }

  private static summarize(lines: readonly DiffLine[]): DiffSummary {
    const addedLines = lines.filter((line) => line.kind === "added").length;
    const removedLines = lines.filter((line) => line.kind === "removed").length;
    const unchangedLines = lines.length - addedLines - removedLines;
    return {
      addedLines,
      removedLines,
      unchangedLines,
      identical: addedLines === 0 && removedLines === 0,
    };
  }
}
