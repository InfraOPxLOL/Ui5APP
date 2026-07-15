import type { SmartFilter } from "../../service/messageMonitoring/MessageInvestigationTypes";

/** Declarative metadata for one quick operational filter (§ Smart Filters). */
export interface SmartFilterDefinition {
  readonly id: SmartFilter;
  readonly titleKey: string;
  readonly icon: string;
}

/**
 * The smart filters the workspace ships with — one-click operational shorthands the backend resolves
 * into a concrete query (`smartFilter` request field, see `srv/src/modules/message-monitoring/service.ts`).
 * Future user-defined filters build on the same `MessageSearchCriteria` shape the Advanced Search
 * Panel already edits, so no new mechanism is needed to add one later.
 */
export const SMART_FILTERS: readonly SmartFilterDefinition[] = [
  { id: "failedToday", titleKey: "smartFilter.failedToday", icon: "sap-icon://error" },
  {
    id: "currentlyProcessing",
    titleKey: "smartFilter.currentlyProcessing",
    icon: "sap-icon://process",
  },
  { id: "longRunning", titleKey: "smartFilter.longRunning", icon: "sap-icon://history" },
  { id: "retryCandidates", titleKey: "smartFilter.retryCandidates", icon: "sap-icon://redo" },
  { id: "businessErrors", titleKey: "smartFilter.businessErrors", icon: "sap-icon://alert" },
  { id: "systemErrors", titleKey: "smartFilter.systemErrors", icon: "sap-icon://message-error" },
  { id: "recentlyFailed", titleKey: "smartFilter.recentlyFailed", icon: "sap-icon://history" },
];
