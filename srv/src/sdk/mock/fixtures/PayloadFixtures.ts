import type { PayloadEnvelope } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<OrderConfirmation><OrderId>4500001234</OrderId><Status>CONFIRMED</Status></OrderConfirmation>`;

/**
 * Generates realistic {@link PayloadEnvelope} attachment entries for a message, for the mock
 * engine's `PayloadProvider` implementation.
 * @param messageId the message id the attachments belong to.
 * @param count number of attachments to generate (default 1).
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated payload envelopes (with content — callers strip it for metadata-only listings).
 */
export function generatePayloadAttachments(
  messageId: string,
  count = 1,
  seed = 42,
): PayloadEnvelope[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    messageId,
    attachmentId: `att-${(seed * 1000 + index).toString(16)}`,
    name: index === 0 ? "request-payload.xml" : `attachment-${index}.xml`,
    contentType: "application/xml",
    sizeBytes: SAMPLE_XML.length + rng.int(0, 512),
    content: SAMPLE_XML,
  }));
}
