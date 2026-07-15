import JSONModel from "sap/ui/model/json/JSONModel";

/** The identifier of a creation flow hosted by the hub's NavContainer. */
export type CreationFlowId = "jmsEntry" | "jmsRouter" | "routerOnly";

/** One card on the Creation Hub launcher (spec §4 — the three creation entry points). */
export interface CreationOption {
  /** Flow id; maps to the nested flow view's control id (`{flow}Flow`). */
  readonly flow: CreationFlowId;
  readonly icon: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  /** A short "creates these parameters" summary line. */
  readonly creates: string;
  /** Whether the flow is built yet; unavailable flows render as roadmapped (no navigation). */
  readonly available: boolean;
}

/** Shape of the Creation Hub view model. */
export interface HubState {
  options: CreationOption[];
}

/**
 * The view model for the Creation Hub launcher (architecture §15). The card copy is resolved from the
 * module bundle by the controller so the strings stay in i18n; only the layout-relevant fields
 * (icon, availability, flow id) are structural.
 *
 * @namespace com.middlewareops.integrationportal.model.coeRouter
 */
export default class HubModel extends JSONModel {
  public constructor() {
    const initial: HubState = { options: [] };
    super(initial);
  }
}
