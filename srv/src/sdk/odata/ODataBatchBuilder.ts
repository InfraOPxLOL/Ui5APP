import type { HttpMethod } from "../http/HttpTypes.js";

/** One operation submitted as part of an OData `$batch` request. */
export interface ODataBatchOperation {
  readonly method: HttpMethod;
  /** URL relative to the service root (e.g. `MessageProcessingLogs('abc')`). */
  readonly url: string;
  /** JSON body for mutating operations. */
  readonly body?: unknown;
}

/** The rendered batch request, ready to send as the HTTP request body. */
export interface ODataBatchRequest {
  readonly body: string;
  readonly contentType: string;
}

/**
 * Builds a `multipart/mixed` OData v2 `$batch` request body from a sequence of operations
 * (architecture: OData Framework, §5 — "Batch requests"). Each operation becomes one
 * `application/http` MIME part per the OData batch specification; the boundary is generated fresh
 * per build so concurrent batches never collide.
 */
export class ODataBatchBuilder {
  private readonly operations: ODataBatchOperation[] = [];

  /**
   * Adds an operation to the batch.
   * @param operation the operation to include.
   * @returns this builder, for chaining.
   */
  public add(operation: ODataBatchOperation): this {
    this.operations.push(operation);
    return this;
  }

  /**
   * Renders the accumulated operations into a batch request body.
   * @returns the request body and its `Content-Type` (including the boundary parameter).
   * @throws {Error} when no operations were added.
   */
  public build(): ODataBatchRequest {
    if (this.operations.length === 0) {
      throw new Error("ODataBatchBuilder.build() requires at least one operation.");
    }
    const boundary = `batch_${crypto.randomUUID()}`;
    const lines: string[] = [];
    for (const operation of this.operations) {
      lines.push(`--${boundary}`);
      lines.push("Content-Type: application/http");
      lines.push("Content-Transfer-Encoding: binary");
      lines.push("");
      lines.push(`${operation.method} ${operation.url} HTTP/1.1`);
      if (operation.body !== undefined) {
        lines.push("Content-Type: application/json");
        lines.push("");
        lines.push(JSON.stringify(operation.body));
      } else {
        lines.push("");
      }
      lines.push("");
    }
    lines.push(`--${boundary}--`);
    return { body: lines.join("\r\n"), contentType: `multipart/mixed;boundary=${boundary}` };
  }
}
