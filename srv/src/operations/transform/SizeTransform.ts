/** Byte-size formatting shared by `AttachmentEngine` and `PayloadEngine`. */

const UNITS = ["B", "KB", "MB", "GB"] as const;

/**
 * Renders a byte count as a short, human-readable string.
 * @param sizeBytes the size in bytes, or `undefined` when unknown.
 * @returns e.g. `"482 B"`, `"12.4 KB"`, `"3.2 MB"`, or `"Unknown size"`.
 */
export function formatBytesHuman(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) {
    return "Unknown size";
  }
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = UNITS[unitIndex] ?? "B";
  return unitIndex === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}
