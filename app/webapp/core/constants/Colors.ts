/**
 * Central colour constants for programmatic (non-theme) colouring.
 *
 * Semantic UI colouring should always prefer UI5 value states (via `StatusFormatter` /
 * `severityToValueState`) so it follows the active theme. These constants exist for the cases
 * value states cannot cover — chart series, tenant identity chips, custom-drawn indicators — and
 * align with the SAP Horizon palette so custom surfaces don't clash with themed ones.
 */
export const Colors = {
  /** Semantic anchors (Horizon-aligned). */
  semantic: {
    positive: "#188918",
    negative: "#D20A0A",
    critical: "#E76500",
    information: "#0070F2",
    neutral: "#556B82",
  },
  /**
   * Categorical palette for chart series and identity colouring (order = assignment order).
   * Chosen for mutual distinguishability on light and dark backgrounds.
   */
  categorical: [
    "#0070F2",
    "#C87B00",
    "#188918",
    "#CE3B6B",
    "#07838F",
    "#8B47D7",
    "#556B82",
    "#A93E00",
  ],
  /** Default tenant accent when a tenant has no configured displayColor. */
  tenantFallback: "#0070F2",
} as const;
