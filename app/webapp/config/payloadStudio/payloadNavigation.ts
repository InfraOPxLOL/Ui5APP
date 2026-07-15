/** What selecting a Payload Navigation item does (§ Payload Navigation — "icon-driven"). */
export type PayloadNavTarget =
  | "request"
  | "response"
  | "comparison"
  | "attachments"
  | "headers"
  | "properties"
  | "metadata"
  | "history";

/** Declarative metadata for one left-navigation item. */
export interface PayloadNavItem {
  readonly id: PayloadNavTarget;
  readonly titleKey: string;
  readonly icon: string;
  /** Whether this item switches the center editor (vs. focusing a bottom tab / the metadata panel). */
  readonly editorSlot: boolean;
  /** Documented future capability — rendered disabled with a "coming soon" affordance. */
  readonly future?: boolean;
}

/** The Payload Navigation items the workspace ships with (§ Payload Navigation). Icon-driven, metadata only. */
export const PAYLOAD_NAV_ITEMS: readonly PayloadNavItem[] = [
  {
    id: "request",
    titleKey: "payloadStudio.nav.request",
    icon: "sap-icon://arrow-right",
    editorSlot: true,
  },
  {
    id: "response",
    titleKey: "payloadStudio.nav.response",
    icon: "sap-icon://arrow-left",
    editorSlot: true,
  },
  {
    id: "comparison",
    titleKey: "payloadStudio.nav.comparison",
    icon: "sap-icon://compare",
    editorSlot: true,
  },
  {
    id: "attachments",
    titleKey: "payloadStudio.nav.attachments",
    icon: "sap-icon://attachment",
    editorSlot: false,
  },
  {
    id: "headers",
    titleKey: "payloadStudio.nav.headers",
    icon: "sap-icon://list",
    editorSlot: false,
  },
  {
    id: "properties",
    titleKey: "payloadStudio.nav.properties",
    icon: "sap-icon://key-user-settings",
    editorSlot: false,
  },
  {
    id: "metadata",
    titleKey: "payloadStudio.nav.metadata",
    icon: "sap-icon://hint",
    editorSlot: false,
  },
  {
    id: "history",
    titleKey: "payloadStudio.nav.history",
    icon: "sap-icon://history",
    editorSlot: false,
    future: true,
  },
];
