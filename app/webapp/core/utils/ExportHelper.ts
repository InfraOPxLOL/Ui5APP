import DownloadUtils from "./DownloadUtils";

/**
 * Describes one exportable column: the source property and its human-readable header.
 */
export interface ExportColumn<T> {
  readonly property: keyof T;
  readonly label: string;
}

/**
 * Client-side export helper used by every table's export action: serializes rows and delegates the
 * actual download to {@link DownloadUtils} (the single download implementation). CSV is the
 * baseline format; richer XLSX export is a later concern gated behind the
 * `enableExperimentalExport` feature flag.
 */
export default class ExportHelper {
  /**
   * Serializes rows to CSV and triggers a browser download.
   * @param rows the data rows.
   * @param columns the columns to include, in order.
   * @param fileName the download file name (without extension).
   */
  public static exportCsv<T>(
    rows: readonly T[],
    columns: readonly ExportColumn<T>[],
    fileName: string,
  ): void {
    DownloadUtils.downloadAs(ExportHelper.toCsv(rows, columns), fileName, "Csv");
  }

  private static toCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): string {
    const header = columns.map((c) => ExportHelper.escapeCell(c.label)).join(",");
    const body = rows.map((row) =>
      columns
        .map((c) => ExportHelper.escapeCell(ExportHelper.stringify(row[c.property])))
        .join(","),
    );
    return [header, ...body].join("\r\n");
  }

  private static stringify(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  private static escapeCell(value: string): string {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
