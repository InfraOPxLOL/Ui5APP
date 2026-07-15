/**
 * Central date/time format patterns and styles.
 *
 * The formatter library (`core/formatters/DateTimeFormatter`) uses locale-aware *styles* by
 * default — prefer those for anything user-facing. The explicit *patterns* here are for the cases
 * that must be locale-stable: export file content, filenames, log lines, and OData query literals.
 */
export const DateFormats = {
  /** Locale-aware styles consumed by sap.ui.core.format.DateFormat. */
  style: {
    dateTime: "medium",
    date: "medium",
    time: "short",
  },
  /** Locale-stable patterns (LDML) for exports, filenames and logs. */
  pattern: {
    isoDate: "yyyy-MM-dd",
    isoDateTime: "yyyy-MM-dd'T'HH:mm:ss",
    fileNameStamp: "yyyyMMdd-HHmmss",
    exportDateTime: "yyyy-MM-dd HH:mm:ss",
  },
} as const;

/**
 * Central time-window presets (hours) offered by monitoring filters. The configured default
 * window comes from `monitoring.json`; these are the selectable choices.
 */
export const TimeWindowPresetsHours = [1, 4, 12, 24, 48, 72, 168] as const;
