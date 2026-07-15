import type { ExportModel } from "../dto/ExportDto.js";
import { ServiceError } from "../../core/errors/ServiceError.js";

/**
 * Prepares export models from common Operations DTOs (architecture: Phase 6, Export Engine, §11).
 * Every method is a pure, static transformation — no I/O, no HTTP response wiring (that belongs to a
 * future UI-facing route handler, out of scope here). All formats build on the *same* input shape
 * (`readonly Record<string, unknown>[]` — typically an array of Operations DTOs, which already are
 * plain records), so adding a new export format never duplicates row-shaping logic.
 */
export class ExportEngine {
  /** Renders rows as CSV (RFC 4180 quoting for values containing commas/quotes/newlines). */
  public static toCsv<T extends Record<string, unknown>>(rows: readonly T[]): ExportModel {
    const headers = ExportEngine.headersOf(rows);
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => ExportEngine.csvEscape(row[header])).join(",")),
    ];
    return {
      format: "csv",
      fileName: "export.csv",
      mimeType: "text/csv",
      content: lines.join("\r\n"),
    };
  }

  /** Renders rows as pretty-printed JSON. */
  public static toJson<T>(rows: readonly T[]): ExportModel {
    return {
      format: "json",
      fileName: "export.json",
      mimeType: "application/json",
      content: JSON.stringify(rows, null, 2),
    };
  }

  /** Renders rows as a simple `<items><item>...</item></items>` XML document. */
  public static toXml<T extends Record<string, unknown>>(rows: readonly T[]): ExportModel {
    const body = rows
      .map(
        (row) =>
          `  <item>${Object.entries(row)
            .map(([key, value]) => `<${key}>${ExportEngine.xmlEscape(value)}</${key}>`)
            .join("")}</item>`,
      )
      .join("\n");
    return {
      format: "xml",
      fileName: "export.xml",
      mimeType: "application/xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n${body}\n</items>`,
    };
  }

  /**
   * Renders rows as a SpreadsheetML 2003 XML workbook — opens natively in Excel with no binary
   * `.xlsx` dependency added to the backend, the same dependency-free philosophy `ODataMetadataParser`
   * applies to XML parsing.
   */
  public static toExcel<T extends Record<string, unknown>>(rows: readonly T[]): ExportModel {
    const headers = ExportEngine.headersOf(rows);
    const headerRow =
      headers.length > 0
        ? `<Row>${headers.map((header) => ExportEngine.spreadsheetCell(header)).join("")}</Row>`
        : "";
    const dataRows = rows
      .map(
        (row) =>
          `<Row>${headers.map((header) => ExportEngine.spreadsheetCell(row[header])).join("")}</Row>`,
      )
      .join("\n");
    const content =
      '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
      `<Worksheet ss:Name="Export"><Table>\n${headerRow}\n${dataRows}\n</Table></Worksheet>\n</Workbook>`;
    return {
      format: "excel",
      fileName: "export.xls",
      mimeType: "application/vnd.ms-excel",
      content,
    };
  }

  /**
   * PDF export — a documented future format (architecture: Phase 6 — "PDF (future)"). Rejects with a
   * typed {@link ServiceError} rather than throwing synchronously or silently no-op'ing, matching the
   * SDK's own documented pattern for future extension points (`sdk/auth/FutureAuthProviders.ts`).
   */
  public static toPdf(): Promise<ExportModel> {
    return Promise.reject(
      new ServiceError("PDF export is not yet implemented (documented future format)."),
    );
  }

  private static headersOf<T extends Record<string, unknown>>(rows: readonly T[]): string[] {
    const [first] = rows;
    return first === undefined ? [] : Object.keys(first);
  }

  private static csvEscape(value: unknown): string {
    const text = value === undefined || value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private static xmlEscape(value: unknown): string {
    const text = value === undefined || value === null ? "" : String(value);
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private static spreadsheetCell(value: unknown): string {
    const text = value === undefined || value === null ? "" : String(value);
    return `<Cell><Data ss:Type="String">${ExportEngine.xmlEscape(text)}</Data></Cell>`;
  }
}
