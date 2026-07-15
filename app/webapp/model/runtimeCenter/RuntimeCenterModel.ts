import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  CatalogEntry,
  DeploymentEvent,
  IntegrationDetails,
  RuntimeHealthSummary,
} from "../../service/runtimeCenter/RuntimeCenterTypes";

/** The Runtime Center's internal section tabs (Integration Details view). */
export type RuntimeCenterTabKey =
  | "runtimeStatus"
  | "deployHistory"
  | "messages"
  | "queues"
  | "certificates";

/** State for the currently selected artifact's Integration Details / Runtime Health / Timeline. */
export interface SelectedArtifactState {
  artifactId: string;
  details: IntegrationDetails | null;
  health: RuntimeHealthSummary | null;
  timeline: readonly DeploymentEvent[];
  activeTab: RuntimeCenterTabKey;
  busy: boolean;
}

function initialSelectedArtifact(): SelectedArtifactState {
  return {
    artifactId: "",
    details: null,
    health: null,
    timeline: [],
    activeTab: "runtimeStatus",
    busy: false,
  };
}

/** The single view model for the Runtime Center (Phase 12). */
export interface RuntimeCenterState {
  busy: boolean;
  catalog: readonly CatalogEntry[];
  catalogSearch: string;
  catalogStatusFilter: "all" | "healthy" | "warning" | "critical";
  detailsOpen: boolean;
  selectedArtifact: SelectedArtifactState;
  error: string;
}

/**
 * The Runtime Center view model, owned by the module component under the `view` model name.
 *
 * @namespace com.middlewareops.integrationportal.model.runtimeCenter
 */
export default class RuntimeCenterModel extends JSONModel {
  public constructor() {
    const initial: RuntimeCenterState = {
      busy: false,
      catalog: [],
      catalogSearch: "",
      catalogStatusFilter: "all",
      detailsOpen: false,
      selectedArtifact: initialSelectedArtifact(),
      error: "",
    };
    super(initial);
  }
}

export { initialSelectedArtifact };
