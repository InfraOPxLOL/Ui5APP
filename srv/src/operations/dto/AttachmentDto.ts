/** The business-friendly view of one payload attachment's metadata (architecture: Phase 6, Attachment Engine, §8). */
export interface AttachmentSummary {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number | undefined;
  readonly sizeHuman: string;
}
