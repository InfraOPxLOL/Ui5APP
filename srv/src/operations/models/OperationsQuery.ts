import type { ProviderPage } from "../../core/providers/types.js";

/** Sort direction for {@link OperationsQueryBuilder.sortBy}. */
export type OperationsSortDirection = "asc" | "desc";

/**
 * The universal query object every engine method accepts (architecture: Phase 6, Query Framework,
 * §15). Business-friendly field names throughout — never an OData `$`-prefixed option, never a raw
 * CPI field name. `page` is 1-based (business-friendly); engines translate it to the SDK's 0-based
 * `skip`/`top` via {@link toProviderPage}.
 *
 * Not every engine consumes every field (a `QueueEngine` search has no `sender`), but sharing one
 * shape means every engine method has the same signature and a caller never needs to know which
 * subset a particular engine reads — exactly the point of a universal query object.
 */
export interface OperationsQuery {
  readonly status?: string;
  readonly sender?: string;
  readonly receiver?: string;
  readonly messageType?: string;
  readonly customStatus?: string;
  readonly applicationId?: string;
  readonly integrationFlow?: string;
  readonly search?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly durationMinMs?: number;
  readonly durationMaxMs?: number;
  readonly queue?: string;
  readonly certificate?: string;
  readonly runtimeStatus?: string;
  /** 1-based page number. */
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string;
  readonly sortDirection: OperationsSortDirection;
  /** Field-selection projection hint (mirrors OData `$select` at the business layer). */
  readonly select?: readonly string[];
  readonly includePayload: boolean;
  readonly includeAttachments: boolean;
  readonly includeHeaders: boolean;
}

/** The query every engine method receives when a caller passes none. */
export const DEFAULT_OPERATIONS_QUERY: OperationsQuery = {
  page: 1,
  pageSize: 50,
  sortDirection: "desc",
  includePayload: false,
  includeAttachments: false,
  includeHeaders: false,
};

/**
 * Fluent builder for {@link OperationsQuery} — the only sanctioned way to build one.
 *
 * @example
 * new OperationsQueryBuilder()
 *   .status("FAILED")
 *   .sender("SAP")
 *   .receiver("S4")
 *   .messageType("ORDERS")
 *   .customStatus("BusinessError")
 *   .applicationId("XYZ")
 *   .page(1)
 *   .pageSize(100)
 *   .sortBy("StartTime")
 *   .desc()
 *   .build();
 */
/** A mutable, partial view of {@link OperationsQuery} — `Partial<T>` alone keeps `readonly`, which a builder's internal state must not have. */
type MutablePartialQuery = { -readonly [K in keyof OperationsQuery]?: OperationsQuery[K] };

export class OperationsQueryBuilder {
  private state: MutablePartialQuery = {};

  public status(value: string): this {
    this.state.status = value;
    return this;
  }

  public sender(value: string): this {
    this.state.sender = value;
    return this;
  }

  public receiver(value: string): this {
    this.state.receiver = value;
    return this;
  }

  public messageType(value: string): this {
    this.state.messageType = value;
    return this;
  }

  public customStatus(value: string): this {
    this.state.customStatus = value;
    return this;
  }

  public applicationId(value: string): this {
    this.state.applicationId = value;
    return this;
  }

  public integrationFlow(value: string): this {
    this.state.integrationFlow = value;
    return this;
  }

  public search(value: string): this {
    this.state.search = value;
    return this;
  }

  public dateFrom(iso: string): this {
    this.state.dateFrom = iso;
    return this;
  }

  public dateTo(iso: string): this {
    this.state.dateTo = iso;
    return this;
  }

  public durationRange(minMs?: number, maxMs?: number): this {
    this.state.durationMinMs = minMs;
    this.state.durationMaxMs = maxMs;
    return this;
  }

  public queue(value: string): this {
    this.state.queue = value;
    return this;
  }

  public certificate(value: string): this {
    this.state.certificate = value;
    return this;
  }

  public runtimeStatus(value: string): this {
    this.state.runtimeStatus = value;
    return this;
  }

  public page(value: number): this {
    this.state.page = value;
    return this;
  }

  public pageSize(value: number): this {
    this.state.pageSize = value;
    return this;
  }

  public sortBy(field: string): this {
    this.state.sortBy = field;
    return this;
  }

  public asc(): this {
    this.state.sortDirection = "asc";
    return this;
  }

  public desc(): this {
    this.state.sortDirection = "desc";
    return this;
  }

  public select(...fields: readonly string[]): this {
    this.state.select = fields;
    return this;
  }

  public includePayload(value = true): this {
    this.state.includePayload = value;
    return this;
  }

  public includeAttachments(value = true): this {
    this.state.includeAttachments = value;
    return this;
  }

  public includeHeaders(value = true): this {
    this.state.includeHeaders = value;
    return this;
  }

  /** @returns the assembled, immutable {@link OperationsQuery}. */
  public build(): OperationsQuery {
    return { ...DEFAULT_OPERATIONS_QUERY, ...this.state };
  }
}

/**
 * Translates an {@link OperationsQuery}'s 1-based paging into the SDK's 0-based {@link ProviderPage}.
 * @param query the operations query.
 * @returns the equivalent `skip`/`top` pair.
 */
export function toProviderPage(query: OperationsQuery): ProviderPage {
  const pageSize = Math.max(1, query.pageSize);
  const page = Math.max(1, query.page);
  return { skip: (page - 1) * pageSize, top: pageSize };
}
