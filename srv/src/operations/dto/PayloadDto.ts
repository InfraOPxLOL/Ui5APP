/** The content shapes `PayloadEngine` recognizes and prepares distinct views for. */
export type PayloadFormat = "xml" | "json" | "text" | "binary";

/**
 * The business-friendly, UI-ready view of one payload/attachment's content (architecture: Phase 6,
 * Payload Engine, §7). Prepares every representation a future Payload Viewer will need; renders
 * nothing itself (no UI here) — `raw`/`formatted`/`tree` are all just strings/data, not markup.
 */
export interface PayloadSummary {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly format: PayloadFormat;
  /** The content exactly as stored (decoded from base64 for text formats; left as-is for binary). */
  readonly raw: string;
  /** Pretty-printed for `json`/`xml`; identical to `raw` for `text`/`binary`. */
  readonly formatted: string;
  /** The parsed object graph for `json` payloads (for a future tree-view renderer); `undefined` otherwise. */
  readonly tree: unknown;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}

/** A ready-to-download representation of one payload (architecture: Phase 6 — "Download Model"). */
export interface PayloadDownloadModel {
  readonly fileName: string;
  readonly mimeType: string;
  readonly contentBase64: string;
}
