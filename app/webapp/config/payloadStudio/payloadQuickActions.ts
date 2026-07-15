import { RoleCollections } from "../../shell/permissions/RoleCollections";
import type { PermissionRequirement } from "../../shell/permissions/PermissionTypes";

/** What invoking a quick action does (§ Quick Actions — "framework only"). */
export type PayloadQuickActionKind = "copy" | "download" | "navigate" | "compare" | "future";

/**
 * Declarative metadata for one Payload Studio quick action (§ Quick Actions). Dispatched generically
 * by the controller based on `kind`; adding an action is a metadata change only — the same framework
 * pattern Message Investigation's own action list already established (§ Permissions — "future
 * permissions require no code changes").
 */
export interface PayloadQuickActionDefinition {
  readonly id: string;
  readonly titleKey: string;
  readonly icon: string;
  readonly kind: PayloadQuickActionKind;
  readonly copyField?: "payload" | "metadata" | "headers";
  readonly route?: string;
  readonly permission?: PermissionRequirement;
}

/**
 * The quick actions the workspace ships with. "Download Payload" is gated behind `PI_PAYLOAD_ADMIN`
 * (§ Permissions — "Administrative Actions") — exporting raw production payload bytes to disk is a
 * more sensitive operation than viewing a pretty-printed, in-browser representation.
 */
export const PAYLOAD_QUICK_ACTIONS: readonly PayloadQuickActionDefinition[] = [
  {
    id: "copyPayload",
    titleKey: "payloadStudio.qa.copyPayload",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "payload",
  },
  {
    id: "downloadPayload",
    titleKey: "payloadStudio.qa.downloadPayload",
    icon: "sap-icon://download",
    kind: "download",
    permission: { anyRoleCollection: [RoleCollections.PayloadAdmin] },
  },
  {
    id: "copyMetadata",
    titleKey: "payloadStudio.qa.copyMetadata",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "metadata",
  },
  {
    id: "copyHeaders",
    titleKey: "payloadStudio.qa.copyHeaders",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "headers",
  },
  {
    id: "openMessage",
    titleKey: "payloadStudio.qa.openMessage",
    icon: "sap-icon://message-information",
    kind: "navigate",
    route: "messageMonitoring",
  },
  {
    id: "openRuntime",
    titleKey: "payloadStudio.qa.openRuntime",
    icon: "sap-icon://pulse",
    kind: "navigate",
    route: "runtimeCenter",
  },
  {
    id: "openQueue",
    titleKey: "payloadStudio.qa.openQueue",
    icon: "sap-icon://combine",
    kind: "navigate",
    route: "jmsQueue",
  },
  {
    id: "comparePayloads",
    titleKey: "payloadStudio.qa.comparePayloads",
    icon: "sap-icon://compare",
    kind: "compare",
  },
  { id: "replay", titleKey: "payloadStudio.qa.replay", icon: "sap-icon://redo", kind: "future" },
  {
    id: "retry",
    titleKey: "payloadStudio.qa.retry",
    icon: "sap-icon://synchronize",
    kind: "future",
  },
];
