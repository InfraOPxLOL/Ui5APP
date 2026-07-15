/**
 * Generates request-scoped identifiers. A request id is distinct from a correlation id: the
 * correlation id is stable across every retry of one logical call (so all attempts are traceable
 * as "the same operation"); the request id is unique *per attempt*, so an individual retry can be
 * pinpointed in logs.
 */
export class RequestIdGenerator {
  /**
   * @returns a new unique request id.
   */
  public static next(): string {
    return crypto.randomUUID();
  }
}
