import JSONModel from "sap/ui/model/json/JSONModel";
import { blankEditor, type EditorState } from "./RuleEditorState";
import type { RuleSummary } from "../../service/coeRuleBuilder/RuleBuilderTypes";

// Re-exported for existing importers (the editor state + factories now live in `RuleEditorState`,
// shared with the route-creation wizards; see that module).
export {
  blankEditor,
  blankXCastRoot,
  type EditorMode,
  type EditorState,
  type RuleKind,
  type RulesetEditorState,
  type XCastEditorState,
  type XCastRowView,
} from "./RuleEditorState";

/** Shape of the CoE Visual Rule Builder view model. */
export interface RuleBuilderState {
  busy: boolean;
  pid: string;
  rules: RuleSummary[];
  /** The editor's working state — hosted by `RuleEditorHostController` at the standard `/ruleEditor` slice. */
  ruleEditor: EditorState;
}

/**
 * The single view model for the CoE Visual Rule Builder workspace (architecture §15). Owned by the
 * controller and exposed under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRuleBuilder
 */
export default class RuleBuilderModel extends JSONModel {
  public constructor() {
    const initial: RuleBuilderState = {
      busy: false,
      pid: "",
      rules: [],
      ruleEditor: blankEditor(""),
    };
    super(initial);
  }
}
