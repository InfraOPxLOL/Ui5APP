import DateTimeFormatter from "./DateTimeFormatter";
import DurationFormatter from "./DurationFormatter";
import SizeFormatter from "./SizeFormatter";
import StatusFormatter from "./StatusFormatter";
import HealthFormatter from "./HealthFormatter";

/**
 * Single barrel import point for the centralized formatter library.
 *
 * Views bind to formatters via a module-level formatter object (see each module's `formatter`),
 * which re-exports from here — guaranteeing that date, duration, size and status formatting is
 * defined once and reused everywhere.
 *
 * NOTE: uses plain imports + a named re-export rather than `export { default as X } from "./Y"`
 * syntax. The latter compiles (via the UI5 transpile toolchain) to a direct, non-interop-safe
 * `.default` property read, which breaks against sibling modules whose default export is
 * transpiled as a bare value (no `.default` wrapper). Plain imports go through the toolchain's
 * `_interopRequireDefault` helper, which handles both shapes correctly.
 */
export { DateTimeFormatter, DurationFormatter, SizeFormatter, StatusFormatter, HealthFormatter };
