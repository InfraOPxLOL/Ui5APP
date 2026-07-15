/**
 * Status normalization shared by every engine that surfaces a raw Integration Suite status string
 * (message status, runtime artifact status, notification severity) to a business-friendly one. Kept
 * here, once, rather than duplicated per engine (architecture: Phase 6 — "No duplicated code").
 */

/** The normalized severity vocabulary every Operations DTO speaks, regardless of source domain. */
export type Severity = "info" | "warning" | "error" | "critical";

const FAILURE_STATUSES = new Set(["FAILED", "ERROR", "STOPPED"]);
const ESCALATED_STATUSES = new Set(["ESCALATED", "RETRY"]);
const SUCCESS_STATUSES = new Set(["COMPLETED", "STARTED", "RUNNING", "SUCCESS"]);
const IN_PROGRESS_STATUSES = new Set(["PROCESSING", "STARTING", "DEPLOYING"]);

/**
 * Maps a raw upstream status string to a normalized {@link Severity}.
 * @param status the raw status (case-insensitive).
 * @returns `"error"` for terminal failures, `"critical"` for statuses needing manual attention,
 *   `"info"` for success/in-progress, `"warning"` for anything unrecognized (flagged for attention
 *   rather than silently assumed fine).
 */
export function severityOfStatus(status: string): Severity {
  const normalized = status.toUpperCase();
  if (FAILURE_STATUSES.has(normalized)) {
    return "error";
  }
  if (ESCALATED_STATUSES.has(normalized)) {
    return "critical";
  }
  if (SUCCESS_STATUSES.has(normalized) || IN_PROGRESS_STATUSES.has(normalized)) {
    return "info";
  }
  return "warning";
}

/**
 * Renders a raw, upper-snake-case-ish upstream status as a human-readable label.
 * @param status the raw status (e.g. `MANUAL_REVIEW_REQUIRED`).
 * @returns the humanized label (e.g. `Manual Review Required`).
 */
export function humanReadableStatus(status: string): string {
  return status
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
