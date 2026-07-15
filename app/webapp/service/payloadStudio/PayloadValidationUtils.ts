import XmlUtils from "../../core/utils/XmlUtils";
import JsonUtils from "../../core/utils/JsonUtils";
import type { PayloadFormat } from "./PayloadStudioTypes";

/** One validation finding (§ Validation — "Error Highlighting"). */
export interface ValidationIssue {
  readonly message: string;
  readonly severity: "error" | "warning";
}

/** The result of validating a payload (§ Validation). Read-only — no editing, ever. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Tests whether text contains control characters invalid in XML 1.0 (anything below U+0020 other
 * than tab/LF/CR) — built from character codes rather than a literal regex range so the disallowed
 * bytes never appear as raw source characters in this file.
 * @param text the text to scan.
 * @returns whether an invalid control character was found.
 */
function hasInvalidControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      return true;
    }
  }
  return false;
}

/**
 * Read-only payload validation (§ Validation): well-formedness for XML, parseability for JSON,
 * and basic character validation for any text payload. Formatting/pretty-printing is `PayloadEngine`'s
 * job (already done server-side); this utility only *reports*, never rewrites, the payload.
 */
export default class PayloadValidationUtils {
  /**
   * Validates a payload according to its detected format.
   * @param raw the raw payload text.
   * @param format the detected payload format.
   * @returns the validation result.
   */
  public static validate(raw: string, format: PayloadFormat): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (format === "xml") {
      if (!XmlUtils.isXml(raw)) {
        issues.push({ message: "Payload is not well-formed XML.", severity: "error" });
      }
    } else if (format === "json") {
      if (!JsonUtils.isJson(raw)) {
        issues.push({ message: "Payload is not valid JSON.", severity: "error" });
      }
    }

    if (hasInvalidControlChars(raw)) {
      issues.push({
        message: "Payload contains control characters invalid in XML 1.0 / typical text encodings.",
        severity: "warning",
      });
    }

    return { valid: issues.every((issue) => issue.severity !== "error"), issues };
  }
}
