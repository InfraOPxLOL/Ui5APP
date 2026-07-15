import JSONModel from "sap/ui/model/json/JSONModel";
import type { RegistryParameter } from "../../service/coeRegistry/CoeRegistryTypes";
import type { AgreementLookup, PresentInEntry } from "../../service/coeRouter/CoeRouterTypes";

/** The sender/receiver pair lookup state shared by the JMS and Router Agreements boxes. */
export interface AgreementBoxState {
  sndprn: string;
  rcvprn: string;
  mestyp: string;
  result: AgreementLookup | null;
}

/** Which mode the General Search box is in: PID-scoped listing, or the reverse "present in" search. */
export type GeneralSearchMode = "byPid" | "presentIn";

/** The General Search box state — both its PID listing mode and its reverse-lookup mode. */
export interface GeneralSearchState {
  mode: GeneralSearchMode;
  pid: string;
  parameters: RegistryParameter[];
  loaded: boolean;
  presentInPid: string;
  presentInEntries: PresentInEntry[];
  presentInSearched: boolean;
}

/** Shape of the Parameter Registry's 3-box view model. */
export interface RegistryState {
  busy: boolean;
  jms: AgreementBoxState;
  router: AgreementBoxState;
  general: GeneralSearchState;
}

/**
 * The single view model for the Parameter Registry workspace (spec §2, Tile 3 — 3-box redesign):
 * JMS Agreements + Router Agreements (read-only sender/receiver pair lookups) and General Search
 * (the original PID-scoped listing, plus a reverse "present in" lookup).
 *
 * @namespace com.middlewareops.integrationportal.model.coeRegistry
 */
export default class RegistryModel extends JSONModel {
  public constructor() {
    const blankAgreementBox = (): AgreementBoxState => ({
      sndprn: "",
      rcvprn: "",
      mestyp: "",
      result: null,
    });
    const initial: RegistryState = {
      busy: false,
      jms: blankAgreementBox(),
      router: blankAgreementBox(),
      general: {
        mode: "byPid",
        pid: "",
        parameters: [],
        loaded: false,
        presentInPid: "",
        presentInEntries: [],
        presentInSearched: false,
      },
    };
    super(initial);
  }
}
