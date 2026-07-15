import type { HeaderEntry, HeaderSummary } from "../dto/HeaderDto.js";

/** SAP standard headers/properties follow this naming convention (e.g. `SAP_Sender`, `SAP_MessageType`). */
const SAP_STANDARD_PREFIX = "SAP_";

/**
 * Normalizes and categorizes headers/properties (architecture: Phase 6, Header Engine, §8).
 *
 * A pure transformation engine: it does not fetch headers itself (no `core/providers` contract yet
 * exposes message-level header retrieval — see {@link MessageDetails}'s doc comment), it only
 * categorizes and searches whatever headers bag a caller supplies. The moment a future phase adds
 * real header retrieval, this engine is already the seam that categorizes the result — no redesign
 * needed here, only a new call site.
 */
export class HeaderEngine {
  /**
   * Categorizes a headers bag into SAP-standard vs. custom.
   * @param headers the raw headers/properties bag.
   * @returns the categorized, searchable summary.
   */
  public categorize(headers: Readonly<Record<string, string>>): HeaderSummary {
    const all = Object.entries(headers).map(([name, value]) => HeaderEngine.toEntry(name, value));
    return {
      all,
      sapStandard: all.filter((entry) => entry.category === "sap-standard"),
      custom: all.filter((entry) => entry.category === "custom"),
    };
  }

  /**
   * Searches a headers bag by name or value substring (case-insensitive).
   * @param headers the raw headers/properties bag.
   * @param term the search term.
   * @returns the matching entries.
   */
  public search(headers: Readonly<Record<string, string>>, term: string): readonly HeaderEntry[] {
    const needle = term.toLowerCase();
    return this.categorize(headers).all.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle),
    );
  }

  private static toEntry(name: string, value: string): HeaderEntry {
    return {
      name,
      value,
      category: name.toUpperCase().startsWith(SAP_STANDARD_PREFIX) ? "sap-standard" : "custom",
    };
  }
}
