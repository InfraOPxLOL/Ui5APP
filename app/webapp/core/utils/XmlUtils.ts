/**
 * XML parsing and formatting utilities, built on the browser's DOMParser/XMLSerializer. Used later
 * by the payload viewer; centralized now so XML handling is written exactly once. Parsing never
 * throws — callers branch on `undefined`.
 */
export default class XmlUtils {
  /**
   * Parses XML without throwing.
   * @param text the XML text.
   * @returns the parsed Document, or `undefined` when the text is not well-formed XML.
   */
  public static safeParse(text: string | null | undefined): Document | undefined {
    if (text === null || text === undefined || text.trim() === "") {
      return undefined;
    }
    const doc = new DOMParser().parseFromString(text, "application/xml");
    return doc.getElementsByTagName("parsererror").length > 0 ? undefined : doc;
  }

  /**
   * @param text the candidate string.
   * @returns whether the string is well-formed XML.
   */
  public static isXml(text: string | null | undefined): boolean {
    return XmlUtils.safeParse(text) !== undefined;
  }

  /**
   * Pretty-prints an XML string with consistent indentation (payload viewers). Malformed XML is
   * returned unchanged so the raw payload is never hidden from the operator.
   * @param text the XML text.
   * @param indent indentation string per depth level (default two spaces).
   * @returns the formatted XML, or the input unchanged when not well-formed.
   */
  public static prettyPrint(text: string, indent = "  "): string {
    const doc = XmlUtils.safeParse(text);
    if (doc === undefined || doc.documentElement === null) {
      return text;
    }
    const out: string[] = [];
    XmlUtils.writeNode(doc.documentElement, 0, indent, out);
    return out.join("\n");
  }

  /**
   * Escapes XML-significant characters in a text value.
   * @param value the untrusted string.
   * @returns the escaped string, safe inside XML text content or attribute values.
   */
  public static escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private static writeNode(node: Element, depth: number, indent: string, out: string[]): void {
    const pad = indent.repeat(depth);
    const attributes = Array.from(node.attributes)
      .map((attribute) => ` ${attribute.name}="${XmlUtils.escape(attribute.value)}"`)
      .join("");
    const childElements = Array.from(node.children);
    const textContent = childElements.length === 0 ? (node.textContent ?? "").trim() : "";

    if (childElements.length === 0) {
      out.push(
        textContent === ""
          ? `${pad}<${node.tagName}${attributes}/>`
          : `${pad}<${node.tagName}${attributes}>${XmlUtils.escape(textContent)}</${node.tagName}>`,
      );
      return;
    }
    out.push(`${pad}<${node.tagName}${attributes}>`);
    for (const child of childElements) {
      XmlUtils.writeNode(child, depth + 1, indent, out);
    }
    out.push(`${pad}</${node.tagName}>`);
  }
}
