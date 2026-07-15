import JSONModel from "sap/ui/model/json/JSONModel";
import type {
  CertificateDashboard,
  CertificateDetail,
  CertificateTimelineEvent,
  SecurityMaterialAvailability,
} from "../../service/certificateSecurityCenter/CertificateSecurityCenterTypes";

/** The Certificate & Security Center's top-level section tabs. */
export type CertificateCenterTabKey = "dashboard" | "explorer" | "securityMaterials";

/** The Certificate Explorer's smart filters (§ Smart Filters). */
export type SmartFilterKey =
  | "all"
  | "expiring7"
  | "expiring30"
  | "expired"
  | "selfSigned"
  | "weakAlgorithm";

/** The Certificate Details panel's own tabs. */
export type DetailsTabKey = "details" | "timeline";

/** State for the currently selected certificate's Details/Timeline. */
export interface SelectedCertificateState {
  alias: string;
  certificate: CertificateDetail | null;
  timeline: readonly CertificateTimelineEvent[];
  activeTab: DetailsTabKey;
  busy: boolean;
}

function initialSelectedCertificate(): SelectedCertificateState {
  return {
    alias: "",
    certificate: null,
    timeline: [],
    activeTab: "details",
    busy: false,
  };
}

/** The single view model for the Certificate & Security Center (Phase 13). */
export interface CertificateSecurityCenterState {
  busy: boolean;
  activeTab: CertificateCenterTabKey;
  dashboard: CertificateDashboard | null;
  certificates: readonly CertificateDetail[];
  explorerSearch: string;
  smartFilter: SmartFilterKey;
  securityMaterials: readonly SecurityMaterialAvailability[];
  detailsOpen: boolean;
  selectedCertificate: SelectedCertificateState;
  error: string;
}

/**
 * The Certificate & Security Center view model, owned by the module component under the `view`
 * model name.
 *
 * @namespace com.middlewareops.integrationportal.model.certificateSecurityCenter
 */
export default class CertificateSecurityCenterModel extends JSONModel {
  public constructor() {
    const initial: CertificateSecurityCenterState = {
      busy: false,
      activeTab: "dashboard",
      dashboard: null,
      certificates: [],
      explorerSearch: "",
      smartFilter: "all",
      securityMaterials: [],
      detailsOpen: false,
      selectedCertificate: initialSelectedCertificate(),
      error: "",
    };
    super(initial);
  }
}

export { initialSelectedCertificate };
