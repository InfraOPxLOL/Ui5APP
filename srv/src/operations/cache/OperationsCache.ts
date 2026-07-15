import { RequestMemo } from "../../core/memo/requestMemo.js";

/**
 * The Operations Engine's caching policy (architecture: Phase 6, Caching, §17 — "request-scoped
 * in-memory caching only... Cache only duplicate requests occurring during the same operation. No
 * persistence. No long-term cache. No database.").
 *
 * That is *exactly* what {@link RequestMemo} (Phase 1, `core/memo/requestMemo.ts`) already does: it
 * coalesces concurrent identical in-flight calls into one shared promise and discards all state the
 * instant it settles — nothing survives between operations. Rather than write a second
 * near-identical de-duplication class (forbidden by the "no duplicated code" mandate), the
 * Operations Engine reuses that class directly; `OperationsEngine` constructs one `RequestMemo`
 * instance per instance of itself (i.e. per composition, not a process-wide singleton), which is
 * what makes it request-scoped in practice: a fresh `OperationsEngine` (and so a fresh cache) per
 * inbound request, matching the stateless-backend constraint.
 *
 * This module exists only to give the concept its own name at the Operations layer and to be the
 * one import site every engine constructor uses — engines never import `core/memo` directly.
 */
export class OperationsCache {
  private readonly memo = new RequestMemo();

  /**
   * Runs `factory` once per distinct `key` during this cache's lifetime, sharing the result with any
   * concurrent caller using the same key while it is in flight.
   * @param key a stable key identifying the operation (e.g. `message.query:{...serialized query}`).
   * @param factory produces the result when there is no in-flight/duplicate call for `key`.
   * @returns the (possibly shared) result.
   */
  public dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
    return this.memo.dedupe(key, factory);
  }
}
