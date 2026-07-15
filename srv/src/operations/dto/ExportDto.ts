/** The export formats `ExportEngine` supports today; `pdf` is a documented future format. */
export type ExportFormat = "csv" | "json" | "xml" | "excel" | "pdf";

/** A prepared, ready-to-serve export (architecture: Phase 6, Export Engine, §11). No UI/HTTP response wiring here — just the model. */
export interface ExportModel {
  readonly format: ExportFormat;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: string;
}
