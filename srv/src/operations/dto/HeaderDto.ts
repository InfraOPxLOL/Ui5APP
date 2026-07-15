/** Which bucket a header falls into — the split every future header UI needs. */
export type HeaderCategory = "sap-standard" | "custom";

/** One normalized header/property entry (architecture: Phase 6, Header Engine, §8). */
export interface HeaderEntry {
  readonly name: string;
  readonly value: string;
  readonly category: HeaderCategory;
}

/** The categorized, searchable view of a headers bag `HeaderEngine.categorize` produces. */
export interface HeaderSummary {
  readonly all: readonly HeaderEntry[];
  readonly sapStandard: readonly HeaderEntry[];
  readonly custom: readonly HeaderEntry[];
}
