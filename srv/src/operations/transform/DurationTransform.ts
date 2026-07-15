/** Duration calculation and formatting shared by `MessageEngine`, `StatisticsEngine` and DTO mapping. */

/**
 * Computes the elapsed milliseconds between two ISO 8601 timestamps.
 * @param startIso the start timestamp.
 * @param endIso the end timestamp; `undefined` when the operation hasn't completed yet.
 * @returns the elapsed milliseconds, or `undefined` when `endIso` is `undefined`.
 */
export function calculateDurationMs(
  startIso: string,
  endIso: string | undefined,
): number | undefined {
  if (endIso === undefined) {
    return undefined;
  }
  return new Date(endIso).getTime() - new Date(startIso).getTime();
}

/**
 * Renders a duration in milliseconds as a short, human-readable string.
 * @param durationMs the duration, or `undefined` for an in-progress operation.
 * @returns e.g. `"340 ms"`, `"12.4 s"`, `"3.2 min"`, `"1.1 h"`, or `"In progress"`.
 */
export function formatDurationHuman(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "In progress";
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)} min`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
}
