import { ContentTypes, type ContentTypeValue } from "./ContentTypes";

/**
 * Central file-type registry: extension ↔ content-type pairs for everything the application
 * downloads or (later) previews. Payload viewers and export actions resolve file naming through
 * this registry instead of concatenating extensions inline.
 */
export interface FileTypeDefinition {
  /** File extension without the dot. */
  readonly extension: string;
  /** MIME content type used when downloading this file type. */
  readonly contentType: ContentTypeValue;
  /** Human-readable label for pickers. */
  readonly label: string;
}

export const FileTypes = {
  Csv: { extension: "csv", contentType: ContentTypes.Csv, label: "CSV" },
  Json: { extension: "json", contentType: ContentTypes.Json, label: "JSON" },
  Xml: { extension: "xml", contentType: ContentTypes.Xml, label: "XML" },
  Text: { extension: "txt", contentType: ContentTypes.PlainText, label: "Text" },
  Zip: { extension: "zip", contentType: ContentTypes.Zip, label: "ZIP archive" },
  Pdf: { extension: "pdf", contentType: ContentTypes.Pdf, label: "PDF" },
  Excel: { extension: "xls", contentType: ContentTypes.Excel, label: "Excel" },
} as const satisfies Record<string, FileTypeDefinition>;

/** Union of the declared file-type keys. */
export type FileTypeKey = keyof typeof FileTypes;
