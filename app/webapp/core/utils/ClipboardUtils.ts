/**
 * Clipboard utilities — the single implementation of "copy to clipboard" (message ids, correlation
 * ids, payloads). Uses the async Clipboard API with a hidden-textarea fallback for restricted
 * contexts; callers get a boolean instead of an exception.
 */
export default class ClipboardUtils {
  /**
   * Copies text to the clipboard.
   * @param text the text to copy.
   * @returns whether the copy succeeded.
   */
  public static async copyText(text: string): Promise<boolean> {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy path (e.g. permission denied).
      }
    }
    return ClipboardUtils.legacyCopy(text);
  }

  private static legacyCopy(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch {
      succeeded = false;
    }
    document.body.removeChild(textarea);
    return succeeded;
  }
}
