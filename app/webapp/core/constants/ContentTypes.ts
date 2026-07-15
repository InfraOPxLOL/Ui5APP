/**
 * Central MIME content-type constants — used for downloads, clipboard payloads, and (later)
 * payload rendering. Never inline a MIME string elsewhere.
 */
export const ContentTypes = {
  Json: "application/json",
  Xml: "application/xml",
  TextXml: "text/xml",
  Csv: "text/csv;charset=utf-8;",
  PlainText: "text/plain;charset=utf-8;",
  Html: "text/html",
  OctetStream: "application/octet-stream",
  Pdf: "application/pdf",
  Zip: "application/zip",
  Excel: "application/vnd.ms-excel",
} as const;

/** Union of the declared content types. */
export type ContentTypeValue = (typeof ContentTypes)[keyof typeof ContentTypes];
