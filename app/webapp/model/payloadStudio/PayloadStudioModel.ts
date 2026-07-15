import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  PayloadStudioData,
  PayloadViewMode,
} from "../../service/payloadStudio/PayloadStudioTypes";
import type { PayloadNavTarget } from "../../config/payloadStudio/payloadNavigation";
import type { DiffResult } from "../../service/payloadStudio/PayloadCompareUtils";
import type { PayloadStatistics } from "../../service/payloadStudio/PayloadStatisticsUtils";
import type { ValidationResult } from "../../service/payloadStudio/PayloadValidationUtils";

/** Search bar state (§ Search). */
export interface SearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  matchCount: number;
  activeMatchIndex: number;
}

/** Comparison state (§ Request/Response Comparison). */
export interface ComparisonState {
  ignoreWhitespace: boolean;
  result: DiffResult | null;
}

/** Editor chrome state (§ Payload Editor). */
export interface EditorState {
  activeTarget: PayloadNavTarget;
  viewMode: PayloadViewMode;
  wordWrap: boolean;
  fullscreen: boolean;
  colorTheme: string;
  /** The text currently rendered by the CodeEditor — recomputed by the controller on every target/view-mode change (avoids complex nested expression bindings). */
  displayText: string;
  /** The CodeEditor `type` (syntax-highlighting mode) for the currently displayed payload. */
  displayFormat: string;
  /** Whether the active payload is binary (rendered as a notice instead of the code editor). */
  displayIsBinary: boolean;
}

/** Layout persistence state (§ Layout — "remember layout during the session"). */
export interface StudioLayoutState {
  navCollapsed: boolean;
  metadataCollapsed: boolean;
  bottomPanelExpanded: boolean;
  bottomTab: string;
}

/** Shape of the Payload Studio view model. */
export interface PayloadStudioState {
  messageId: string;
  busy: boolean;
  data: PayloadStudioData | null;
  editor: EditorState;
  search: SearchState;
  comparison: ComparisonState;
  statistics: PayloadStatistics | null;
  validation: ValidationResult | null;
  layout: StudioLayoutState;
}

/**
 * The single view model for Payload Studio (architecture §15). Owned by the module component and
 * exposed to the view under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.payloadStudio
 */
export default class PayloadStudioModel extends JSONModel {
  public constructor() {
    const initial: PayloadStudioState = {
      messageId: "",
      busy: false,
      data: null,
      editor: {
        activeTarget: "request",
        viewMode: "pretty",
        wordWrap: true,
        fullscreen: false,
        colorTheme: "textmate",
        displayText: "",
        displayFormat: "text",
        displayIsBinary: false,
      },
      search: {
        query: "",
        caseSensitive: false,
        wholeWord: false,
        regex: false,
        matchCount: 0,
        activeMatchIndex: -1,
      },
      comparison: { ignoreWhitespace: false, result: null },
      statistics: null,
      validation: null,
      layout: {
        navCollapsed: false,
        metadataCollapsed: false,
        bottomPanelExpanded: true,
        bottomTab: "properties",
      },
    };
    super(initial);
  }
}
