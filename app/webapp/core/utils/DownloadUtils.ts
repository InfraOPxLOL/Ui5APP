import { ContentTypes, type ContentTypeValue } from "../constants/ContentTypes";
import { FileTypes, type FileTypeKey } from "../constants/FileTypes";

/**
 * Browser download utilities — the single implementation of "hand the user a file". Every export
 * and payload-download action funnels through here so download behaviour (anchor lifecycle, object
 * URL release, BOM handling) is written exactly once.
 */
export default class DownloadUtils {
  /**
   * Downloads a Blob under a file name.
   * @param blob the content.
   * @param fileName the full file name including extension.
   */
  public static downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  /**
   * Downloads text content under a file name.
   * @param content the text content.
   * @param fileName the full file name including extension.
   * @param contentType the MIME type (from {@link ContentTypes}).
   * @param withBom whether to prepend a UTF-8 BOM (spreadsheet apps need it to detect encoding).
   */
  public static downloadText(
    content: string,
    fileName: string,
    contentType: ContentTypeValue = ContentTypes.PlainText,
    withBom = false,
  ): void {
    const payload = withBom ? String.fromCharCode(0xfeff) + content : content;
    DownloadUtils.downloadBlob(new Blob([payload], { type: contentType }), fileName);
  }

  /**
   * Downloads text content as a registered file type, deriving extension and MIME type from the
   * central {@link FileTypes} registry.
   * @param content the text content.
   * @param baseName the file name without extension.
   * @param type the file-type key.
   */
  public static downloadAs(content: string, baseName: string, type: FileTypeKey): void {
    const definition = FileTypes[type];
    DownloadUtils.downloadText(
      content,
      `${baseName}.${definition.extension}`,
      definition.contentType,
      type === "Csv",
    );
  }
}
