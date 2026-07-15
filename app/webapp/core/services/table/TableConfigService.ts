import type { ColumnType } from "../../types/Table";
import { DateTimeFormatter, DurationFormatter, SizeFormatter } from "../../formatters";

/**
 * Resolves the declarative column {@link ColumnType} of a table column into the concrete cell
 * formatter to apply. Shared by the {@link ConfigurableTable} control so cell rendering behaviour
 * is defined once and consistent across every module's tables.
 */
export default class TableConfigService {
  private static instance: TableConfigService | undefined;

  private constructor() {
    // Singleton — use TableConfigService.getInstance().
  }

  /**
   * @returns the process-wide singleton table config service.
   */
  public static getInstance(): TableConfigService {
    TableConfigService.instance ??= new TableConfigService();
    return TableConfigService.instance;
  }

  /**
   * Returns a formatter function for a given column type, or `undefined` when the raw value is
   * rendered as-is (or by a dedicated control, e.g. status/severity badges).
   * @param type the column rendering type.
   * @returns a value-to-string formatter, or `undefined`.
   */
  public getCellFormatter(type: ColumnType): ((value: unknown) => string) | undefined {
    switch (type) {
      case "date":
        return (value) => DateTimeFormatter.formatDateTime(value as string | number | Date);
      case "duration":
        return (value) => DurationFormatter.formatMillis(value as number);
      case "size":
        return (value) => SizeFormatter.formatBytes(value as number);
      case "number":
        return (value) => (value === null || value === undefined ? "" : String(value));
      case "text":
      case "status":
      case "severity":
      default:
        return undefined;
    }
  }
}
