/**
 * Health/expiry scoring shared by `CertificateEngine`, `RuntimeEngine` and `QueueEngine` — the same
 * three-tier vocabulary (`healthy`/`warning`/`critical`) applied to whatever "is this thing okay"
 * question each engine asks, so a future dashboard can render all three consistently.
 */

/** The normalized health vocabulary every Operations DTO speaks. */
export type HealthStatus = "healthy" | "warning" | "critical";

/**
 * Days remaining until a certificate's expiry (negative once already expired).
 * @param validToIso the certificate's `validTo` timestamp (ISO 8601).
 * @returns whole days remaining, rounded up.
 */
export function daysRemaining(validToIso: string): number {
  return Math.ceil((new Date(validToIso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Scores a certificate's health from its expiry.
 * @param validToIso the certificate's `validTo` timestamp (ISO 8601).
 * @returns `"critical"` once expired, `"warning"` within 30 days, else `"healthy"`.
 */
export function certificateHealth(validToIso: string): HealthStatus {
  const days = daysRemaining(validToIso);
  if (days < 0) {
    return "critical";
  }
  if (days <= 30) {
    return "warning";
  }
  return "healthy";
}

const HEALTHY_RUNTIME_STATUSES = new Set(["STARTED", "RUNNING"]);
const CRITICAL_RUNTIME_STATUSES = new Set(["ERROR", "STOPPED"]);

/**
 * Scores a deployed runtime artifact's health from its status.
 * @param status the artifact's raw runtime status.
 * @returns `"healthy"` when started/running, `"critical"` when errored/stopped, else `"warning"`
 *   (e.g. mid-deployment — flagged for attention, not assumed fine).
 */
export function runtimeHealth(status: string): HealthStatus {
  const normalized = status.toUpperCase();
  if (HEALTHY_RUNTIME_STATUSES.has(normalized)) {
    return "healthy";
  }
  if (CRITICAL_RUNTIME_STATUSES.has(normalized)) {
    return "critical";
  }
  return "warning";
}

/**
 * Scores a JMS queue's health from its capacity utilization.
 * @param capacityUsedPct the queue's reported capacity usage, 0–100.
 * @returns `"critical"` at ≥90%, `"warning"` at ≥70%, else `"healthy"`.
 */
export function queueHealth(capacityUsedPct: number): HealthStatus {
  if (capacityUsedPct >= 90) {
    return "critical";
  }
  if (capacityUsedPct >= 70) {
    return "warning";
  }
  return "healthy";
}

/**
 * Clamps a reported capacity percentage into the valid 0–100 range, defensively — upstream data
 * should already be in range, but a display value must never be allowed to read e.g. `104%`.
 * @param capacityUsedPct the raw reported percentage.
 * @returns the clamped percentage.
 */
export function clampUtilization(capacityUsedPct: number): number {
  return Math.max(0, Math.min(100, capacityUsedPct));
}
