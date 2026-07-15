import type { MessageSummary } from "../dto/MessageDto.js";
import type { RuntimeSummary } from "../dto/RuntimeDto.js";
import type { QueueSummary } from "../dto/QueueDto.js";
import type { CertificateSummary } from "../dto/CertificateDto.js";

/** Evaluates whether one item matches a single named criterion's value. */
export type FilterPredicate<T> = (criterionValue: unknown, item: T) => boolean;

/**
 * Reusable, extensible in-memory filtering (architecture: Phase 6, Filter Engine, §4).
 *
 * A generic registry of named predicates rather than a fixed `if`/`switch` chain: `apply()` walks
 * whichever criteria are actually present in the supplied criteria object and applies each
 * registered predicate for that name — an item passes only if every present criterion's predicate
 * accepts it. New filter fields are added via {@link register}, entirely without touching existing
 * registrations or `apply()` itself (the Open/Closed mandate: "Future filters should be added without
 * modifying existing code"). Every static factory below (`forMessages`, `forRuntime`, `forQueues`,
 * `forCertificates`) is built on this same generic core — no per-domain filtering logic is
 * duplicated, only the predicate *registrations* differ.
 */
export class FilterEngine<T> {
  private readonly predicates = new Map<string, FilterPredicate<T>>();

  /**
   * Registers (or replaces) the predicate for a named criterion.
   * @param name the criterion name (matches a key in the criteria object passed to {@link apply}).
   * @param predicate evaluates one item against the criterion's value.
   * @returns this engine, for chaining.
   */
  public register(name: string, predicate: FilterPredicate<T>): this {
    this.predicates.set(name, predicate);
    return this;
  }

  /**
   * Filters `items`, keeping only those matching every criterion present (i.e. not `undefined`) in
   * `criteria`. A criterion with no registered predicate is ignored (fails open, not closed — an
   * unknown filter name never silently excludes everything).
   * @param items the candidate items.
   * @param criteria a criterion-name → value map (typically built from an `OperationsQuery`).
   * @returns the matching items, in their original order.
   */
  public apply(items: readonly T[], criteria: Readonly<Record<string, unknown>>): T[] {
    const active = Object.entries(criteria).filter(([, value]) => value !== undefined);
    if (active.length === 0) {
      return [...items];
    }
    return items.filter((item) =>
      active.every(([name, value]) => {
        const predicate = this.predicates.get(name);
        return predicate === undefined || predicate(value, item);
      }),
    );
  }

  /** @returns a {@link FilterEngine} pre-registered with every `MessageSummary` filter criterion Phase 6 lists. */
  public static forMessages(): FilterEngine<MessageSummary> {
    return new FilterEngine<MessageSummary>()
      .register("status", (value, item) => item.status === value)
      .register("messageType", (value, item) => item.messageType === value)
      .register("applicationId", (value, item) => item.applicationId === value)
      .register("sender", (value, item) => item.sender === value)
      .register("receiver", (value, item) => item.receiver === value)
      .register("customStatus", (value, item) => item.customStatus === value)
      .register("integrationFlow", (value, item) => item.integrationFlow === value)
      .register("dateFrom", (value, item) => item.startTime >= (value as string))
      .register("dateTo", (value, item) => item.startTime <= (value as string))
      .register(
        "durationMinMs",
        (value, item) => (item.processingTimeMs ?? Number.POSITIVE_INFINITY) >= (value as number),
      )
      .register(
        "durationMaxMs",
        (value, item) => (item.processingTimeMs ?? Number.NEGATIVE_INFINITY) <= (value as number),
      );
  }

  /** @returns a {@link FilterEngine} pre-registered with every `RuntimeSummary` filter criterion Phase 6 lists. */
  public static forRuntime(): FilterEngine<RuntimeSummary> {
    return new FilterEngine<RuntimeSummary>()
      .register("runtimeStatus", (value, item) => item.status === value)
      .register("health", (value, item) => item.health === value);
  }

  /** @returns a {@link FilterEngine} pre-registered with every `QueueSummary` filter criterion Phase 6 lists. */
  public static forQueues(): FilterEngine<QueueSummary> {
    return new FilterEngine<QueueSummary>()
      .register("queue", (value, item) => item.queueName === value)
      .register("health", (value, item) => item.health === value);
  }

  /** @returns a {@link FilterEngine} pre-registered with every `CertificateSummary` filter criterion Phase 6 lists. */
  public static forCertificates(): FilterEngine<CertificateSummary> {
    return new FilterEngine<CertificateSummary>()
      .register("certificate", (value, item) => item.alias.includes(value as string))
      .register(
        "certificateExpiryWithinDays",
        (value, item) => item.daysRemaining <= (value as number),
      );
  }
}
