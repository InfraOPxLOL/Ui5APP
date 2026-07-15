import { gunzipSync } from "node:zlib";

/**
 * Decodes one gzip+base64-encoded text field from a Splunk HEC event (CPI compresses
 * request/response payload bodies before pushing them to Splunk). Shared by
 * `MockSplunkProvider.ts` today and intended for a future `RealSplunkProvider` to reuse verbatim —
 * this is the one place this decode step is implemented.
 * @param value the gzip-compressed, base64-encoded text.
 * @returns the decoded text.
 * @throws if `value` is not valid base64-encoded gzip data.
 */
export function decodeGzipBase64Text(value: string): string {
  return gunzipSync(Buffer.from(value, "base64")).toString("utf8");
}
