import type { SeverityValue } from "../../core/constants/Severity";

/**
 * Generated accessor signatures for {@link SeverityBadge}'s managed properties.
 *
 * This mirrors the output of `@ui5/ts-interface-generator`. UI5 creates these accessors at runtime
 * from the control's `metadata`; this declaration makes them visible to the TypeScript compiler.
 * Regenerate (or hand-edit) when the control's metadata changes.
 */
declare module "./SeverityBadge" {
  export default interface SeverityBadge {
    /** @returns the current severity value. */
    getSeverity(): SeverityValue;
    /**
     * Sets the severity value.
     * @param severity the severity value.
     * @returns this control, for chaining.
     */
    setSeverity(severity: SeverityValue): this;
  }
}
