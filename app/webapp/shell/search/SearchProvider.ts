import type { PermissionRequirement } from "../permissions/PermissionTypes";

/**
 * A single global-search hit contributed by a provider (§14). Deliberately generic so any future
 * module (messages, queues, certificates, …) can describe its results uniformly; the shell renders
 * and dispatches them without knowing the domain.
 */
export interface SearchResultItem {
  /** Stable id, unique within the contributing provider. */
  readonly id: string;
  /** Primary label shown in the results list. */
  readonly title: string;
  /** Secondary text (context/subtitle). */
  readonly description: string;
  /** SAP icon URI for the result row. */
  readonly icon: string;
  /** The id of the provider that produced this hit. */
  readonly providerId: string;
  /** Route to navigate to when the hit is chosen, if any. */
  readonly route?: string;
  /** Route parameters for {@link route}, if any. */
  readonly routeParameters?: Readonly<Record<string, string>>;
}

/**
 * A source of global-search results (§14). Future modules implement and {@link
 * module:shell/search/GlobalSearch.register} one; the shell aggregates across all authorized
 * providers. This is the *contract* only — no provider ships in this phase (no Monitoring search
 * yet).
 */
export interface SearchProvider {
  /** Stable provider id (matches a module's `searchProviderId`, §5). */
  readonly id: string;
  /** i18n key for the provider's result-group heading. */
  readonly titleKey: string;
  /** SAP icon URI representing the provider/group. */
  readonly icon: string;
  /** Permission gate; an unauthorized provider is skipped entirely (§12, §14). */
  readonly permission?: PermissionRequirement;
  /**
   * Executes a search.
   * @param query the user's query string (already trimmed by the shell).
   * @param signal optional abort signal so superseded searches can be cancelled.
   * @returns the provider's hits (may be empty).
   */
  search(query: string, signal?: AbortSignal): Promise<readonly SearchResultItem[]>;
}

/** A provider's results grouped under its heading, as returned by the aggregator (§14). */
export interface SearchResultGroup {
  readonly providerId: string;
  readonly titleKey: string;
  readonly icon: string;
  readonly items: readonly SearchResultItem[];
}
