/** A relative time window, or `all` (no bound) / `custom` (explicit from–to). */
export type TimePresetKey =
  | "1m"
  | "15m"
  | "1h"
  | "4h"
  | "1d"
  | "7d"
  | "1mo"
  | "3mo"
  | "all"
  | "custom";

/** One entry of the time-window dropdown. */
export interface TimePreset {
  readonly key: TimePresetKey;
  /** Short code shown beside the label, e.g. `1H`. */
  readonly code: string;
  /** i18n key of the label, e.g. "Last hour". */
  readonly labelKey: string;
}

/** The resolved window: `undefined` bounds are open. */
export interface TimeWindow {
  readonly from?: Date;
  readonly to?: Date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Fixed-length windows. Months are calendar months, resolved separately. */
const DURATION_MS: Partial<Record<TimePresetKey, number>> = {
  "1m": MINUTE,
  "15m": 15 * MINUTE,
  "1h": HOUR,
  "4h": 4 * HOUR,
  "1d": DAY,
  "7d": 7 * DAY,
};

const MONTHS: Partial<Record<TimePresetKey, number>> = { "1mo": 1, "3mo": 3 };

/**
 * Relative time windows for search screens (1m, 15m, 1H, 4H, 1D, 7D, 1M, 3M, any time, custom).
 *
 * A preset is stored as its key, never as dates, so a saved view keeps meaning "the last hour"
 * whenever it is loaded; the window is resolved against the clock at search time. Pure and
 * framework-free, so it is unit tested directly.
 */
export default class TimePresets {
  /** Every preset, in dropdown order. */
  public static readonly ALL: readonly TimePreset[] = [
    { key: "1m", code: "1m", labelKey: "time.lastMinute" },
    { key: "15m", code: "15m", labelKey: "time.last15Minutes" },
    { key: "1h", code: "1H", labelKey: "time.lastHour" },
    { key: "4h", code: "4H", labelKey: "time.last4Hours" },
    { key: "1d", code: "1D", labelKey: "time.last24Hours" },
    { key: "7d", code: "7D", labelKey: "time.last7Days" },
    { key: "1mo", code: "1M", labelKey: "time.lastMonth" },
    { key: "3mo", code: "3M", labelKey: "time.last3Months" },
    { key: "all", code: "∞", labelKey: "time.anyTime" },
    { key: "custom", code: "…", labelKey: "time.custom" },
  ];

  /** @returns whether `key` names a known preset. */
  public static isKey(key: unknown): key is TimePresetKey {
    return TimePresets.ALL.some((preset) => preset.key === key);
  }

  /**
   * Resolves a preset to concrete bounds.
   * @param key the preset.
   * @param custom the explicit bounds, used only for `custom`.
   * @param now the reference instant (injectable for tests).
   * @returns the window; `all` has neither bound, relative presets end open ("up to now").
   */
  public static resolve(
    key: TimePresetKey,
    custom: { readonly from: Date | null; readonly to: Date | null } = { from: null, to: null },
    now: Date = new Date(),
  ): TimeWindow {
    if (key === "custom") {
      return { from: custom.from ?? undefined, to: custom.to ?? undefined };
    }
    const duration = DURATION_MS[key];
    if (duration !== undefined) {
      return { from: new Date(now.getTime() - duration) };
    }
    const months = MONTHS[key];
    if (months !== undefined) {
      const from = new Date(now.getTime());
      from.setMonth(from.getMonth() - months);
      return { from };
    }
    return {};
  }
}
