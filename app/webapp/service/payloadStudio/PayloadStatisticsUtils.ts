import XmlUtils from "../../core/utils/XmlUtils";
import TextSearchUtils from "../../core/utils/TextSearchUtils";
import type { PayloadFormat } from "./PayloadStudioTypes";

/** Structural statistics for one payload (§ Payload Statistics). */
export interface PayloadStatistics {
  readonly sizeBytes: number;
  readonly lineCount: number;
  readonly characterCount: number;
  /** XML: total element + text/comment nodes; JSON: total nested values (objects + arrays + scalars). `undefined` for text/binary. */
  readonly nodeCount: number | undefined;
  /** XML element count; `undefined` for non-XML. */
  readonly elementCount: number | undefined;
  /** XML attribute count; `undefined` for non-XML. */
  readonly attributeCount: number | undefined;
  /** JSON array count; `undefined` for non-JSON. */
  readonly arrayCount: number | undefined;
  /** JSON object count; `undefined` for non-JSON. */
  readonly objectCount: number | undefined;
}

/**
 * Computes structural statistics for a payload (§ Payload Statistics), entirely client-side over
 * already-fetched text — no backend round trip per view. Read-only, pure; never mutates the payload.
 */
export default class PayloadStatisticsUtils {
  /**
   * Computes statistics for a payload.
   * @param raw the raw payload text.
   * @param format the detected payload format.
   * @param tree the parsed JSON tree (already provided for `json` payloads by the backend), if any.
   * @returns the computed statistics.
   */
  public static compute(raw: string, format: PayloadFormat, tree: unknown): PayloadStatistics {
    const base = {
      sizeBytes: new TextEncoder().encode(raw).length,
      lineCount: TextSearchUtils.lineCount(raw),
      characterCount: raw.length,
    };
    if (format === "xml") {
      const counts = PayloadStatisticsUtils.countXml(raw);
      return {
        ...base,
        nodeCount: counts.elementCount + counts.textNodeCount,
        elementCount: counts.elementCount,
        attributeCount: counts.attributeCount,
        arrayCount: undefined,
        objectCount: undefined,
      };
    }
    if (format === "json") {
      const counts = PayloadStatisticsUtils.countJson(tree);
      return {
        ...base,
        nodeCount: counts.arrayCount + counts.objectCount + counts.scalarCount,
        elementCount: undefined,
        attributeCount: undefined,
        arrayCount: counts.arrayCount,
        objectCount: counts.objectCount,
      };
    }
    return {
      ...base,
      nodeCount: undefined,
      elementCount: undefined,
      attributeCount: undefined,
      arrayCount: undefined,
      objectCount: undefined,
    };
  }

  private static countXml(raw: string): {
    elementCount: number;
    attributeCount: number;
    textNodeCount: number;
  } {
    const doc = XmlUtils.safeParse(raw);
    if (doc === undefined || doc.documentElement === null) {
      return { elementCount: 0, attributeCount: 0, textNodeCount: 0 };
    }
    let elementCount = 0;
    let attributeCount = 0;
    let textNodeCount = 0;
    const walk = (node: Element): void => {
      elementCount += 1;
      attributeCount += node.attributes.length;
      const hasElementChildren = node.children.length > 0;
      if (!hasElementChildren && (node.textContent ?? "").trim() !== "") {
        textNodeCount += 1;
      }
      for (const child of Array.from(node.children)) {
        walk(child);
      }
    };
    walk(doc.documentElement);
    return { elementCount, attributeCount, textNodeCount };
  }

  private static countJson(tree: unknown): {
    arrayCount: number;
    objectCount: number;
    scalarCount: number;
  } {
    let arrayCount = 0;
    let objectCount = 0;
    let scalarCount = 0;
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        arrayCount += 1;
        value.forEach(walk);
      } else if (value !== null && typeof value === "object") {
        objectCount += 1;
        Object.values(value as Record<string, unknown>).forEach(walk);
      } else {
        scalarCount += 1;
      }
    };
    if (tree !== undefined) {
      walk(tree);
    }
    return { arrayCount, objectCount, scalarCount };
  }
}
