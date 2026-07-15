/**
 * The OData protocol versions the framework supports today. Kept as an explicit parameter on every
 * rendering method (rather than a single global setting) so the framework can talk to a v2 API and
 * a v4 API side by side — and so a future v4.01/v5 can be added as one more union member
 * (architecture: OData Framework, §5 — "Future OData versions").
 */
export type ODataVersion = "v2" | "v4";

/** The literal value types an OData filter comparison may hold. */
export type ODataLiteral = string | number | boolean | Date;
