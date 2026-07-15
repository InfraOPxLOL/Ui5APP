import { RouteNames } from "../../core/constants/RouteNames";

/**
 * Declarative metadata for one operational quick action (§5). Metadata-driven: adding an action is
 * one entry here — the controller resolves the title and dispatches by `route`/`command`, and the
 * `QuickActionPanel` fragment renders it. Nothing about the panel is hardcoded.
 */
export interface OperationsQuickAction {
  readonly id: string;
  readonly titleKey: string;
  readonly icon: string;
  /** Route to navigate to (mutually exclusive with `command`). */
  readonly route?: string;
  /** Shell/workspace command to raise (mutually exclusive with `route`). */
  readonly command?: string;
  readonly emphasized?: boolean;
}

/** The operational quick actions the workspace ships with (§5). */
export const OPERATIONS_QUICK_ACTIONS: readonly OperationsQuickAction[] = [
  {
    id: "messages",
    titleKey: "ops.qa.messages",
    icon: "sap-icon://message-information",
    route: RouteNames.MessageMonitoring,
    emphasized: true,
  },
  { id: "retry", titleKey: "ops.qa.retry", icon: "sap-icon://redo", route: RouteNames.JmsQueue },
  {
    id: "runtime",
    titleKey: "ops.qa.runtime",
    icon: "sap-icon://pulse",
    route: RouteNames.RuntimeCenter,
  },
  {
    id: "certificates",
    titleKey: "ops.qa.certificates",
    icon: "sap-icon://key",
    route: RouteNames.CertificateSecurityCenter,
  },
  {
    id: "searchMessages",
    titleKey: "ops.qa.searchMessages",
    icon: "sap-icon://search",
    command: "focusSearch",
  },
  {
    id: "switchTenant",
    titleKey: "ops.qa.switchTenant",
    icon: "sap-icon://cloud",
    command: "switchTenant",
  },
  {
    id: "administration",
    titleKey: "ops.qa.administration",
    icon: "sap-icon://settings",
    route: RouteNames.Administration,
  },
];
