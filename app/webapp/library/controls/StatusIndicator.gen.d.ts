import type { StatusDomain } from "./StatusIndicator";

/**
 * Generated accessor signatures for {@link StatusIndicator}'s managed properties (mirrors
 * `@ui5/ts-interface-generator` output). Makes the UI5-generated runtime accessors visible to the
 * TypeScript compiler.
 */
declare module "./StatusIndicator" {
  export default interface StatusIndicator {
    /** @returns the raw status value. */
    getStatusValue(): string;
    /**
     * Sets the raw status value.
     * @param value the status value.
     * @returns this control, for chaining.
     */
    setStatusValue(value: string): this;
    /** @returns the status domain. */
    getDomain(): StatusDomain;
    /**
     * Sets the status domain.
     * @param domain the status domain.
     * @returns this control, for chaining.
     */
    setDomain(domain: StatusDomain): this;
    /** @returns whether the mapped icon is shown. */
    getShowIcon(): boolean;
    /**
     * Sets whether the mapped icon is shown.
     * @param showIcon whether to show the icon.
     * @returns this control, for chaining.
     */
    setShowIcon(showIcon: boolean): this;
  }
}
