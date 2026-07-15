import type { AlertEvent } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

const SEVERITIES = ["INFO", "WARNING", "WARNING", "ERROR", "CRITICAL"];
const TEMPLATES: ReadonlyArray<{
  title: string;
  description: string;
  source: string;
  tags: readonly string[];
}> = [
  {
    title: "Message processing failed",
    description: "5 messages failed processing on flow OrderToCash_SalesOrder_IN in the last hour.",
    source: "message-monitoring",
    tags: ["messaging", "failure"],
  },
  {
    title: "Queue nearing capacity",
    description: "Queue INTEGRATION.ORDERS.IN is at 92% capacity.",
    source: "jms-queue",
    tags: ["jms", "capacity"],
  },
  {
    title: "Certificate expiring soon",
    description: "Certificate 'partner-signing-cert-2' expires in 8 days.",
    source: "certificate-management",
    tags: ["security", "certificate"],
  },
  {
    title: "Runtime artifact error",
    description: "Integration flow ShipmentNotification_OUT failed to (re)start.",
    source: "runtime",
    tags: ["runtime", "deployment"],
  },
];

/**
 * Generates a deterministic list of realistic {@link AlertEvent} entries for the mock engine's
 * `AlertProvider` implementation, newest first.
 * @param count number of entries to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated alerts.
 */
export function generateAlerts(count: number, seed = 42): AlertEvent[] {
  const rng = new SeededRandom(seed);
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const template = rng.pick(TEMPLATES);
    return {
      alertId: `alert-${(seed * 1000 + index).toString(16)}`,
      severity: rng.pick(SEVERITIES),
      title: template.title,
      description: template.description,
      source: template.source,
      raisedAt: new Date(now - index * 180000 - rng.int(0, 179000)).toISOString(),
      tags: template.tags,
    };
  });
}
