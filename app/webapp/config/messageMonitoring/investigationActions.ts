import { RoleCollections } from "../../shell/permissions/RoleCollections";
import type { PermissionRequirement } from "../../shell/permissions/PermissionTypes";

/** What invoking an investigation action does (§ Message Actions — "framework only"). */
export type InvestigationActionKind =
  | "navigate"
  | "copy"
  | "drawerTab"
  | "future"
  | "viewDetails"
  | "recover"
  | "download";

/**
 * Declarative metadata for one message action (§ Message Actions). Every action is dispatched
 * generically by the controller based on `kind`; adding an action is a metadata change here only.
 * Permission gates reuse the shell's {@link module:shell/permissions/PermissionEngine} — the exact
 * mechanism Phase 7 built so "future permissions require no code changes" (§ Permissions).
 */
export interface InvestigationActionDefinition {
  readonly id: string;
  readonly titleKey: string;
  readonly icon: string;
  readonly kind: InvestigationActionKind;
  /** Target route for `navigate` actions. */
  readonly route?: string;
  /** Target Detail Drawer tab key for `drawerTab` actions. */
  readonly drawerTab?: string;
  /** Clipboard field selector for `copy` actions. */
  readonly copyField?: "messageId" | "correlationId" | "headers" | "metadata";
  readonly permission?: PermissionRequirement;
}

/** The message actions the workspace ships with (§ Message Actions). */
export const INVESTIGATION_ACTIONS: readonly InvestigationActionDefinition[] = [
  {
    id: "openPayload",
    titleKey: "action.openPayload",
    icon: "sap-icon://document-text",
    kind: "navigate",
    route: "payloadStudio",
    permission: { anyRoleCollection: [RoleCollections.PayloadViewer] },
  },
  {
    id: "openHeaders",
    titleKey: "action.openHeaders",
    icon: "sap-icon://list",
    kind: "drawerTab",
    drawerTab: "headers",
  },
  {
    id: "openAttachments",
    titleKey: "action.openAttachments",
    icon: "sap-icon://attachment",
    kind: "drawerTab",
    drawerTab: "attachments",
  },
  {
    id: "openRuntime",
    titleKey: "action.openRuntime",
    icon: "sap-icon://pulse",
    kind: "navigate",
    route: "runtimeCenter",
  },
  {
    id: "openQueue",
    titleKey: "action.openQueue",
    icon: "sap-icon://combine",
    kind: "navigate",
    route: "jmsQueue",
  },
  {
    id: "viewDetails",
    titleKey: "action.viewDetails",
    icon: "sap-icon://detail-view",
    kind: "viewDetails",
  },
  {
    id: "recover",
    titleKey: "action.recover",
    icon: "sap-icon://redo",
    // Framework-aware since Phase 13: resolves whichever recovery strategy owns the message rather
    // than assuming a JMS-bridge retry.
    kind: "recover",
    permission: { anyRoleCollection: [RoleCollections.RetryOperator] },
  },
  {
    id: "download",
    titleKey: "action.download",
    icon: "sap-icon://download",
    kind: "download",
  },
  {
    id: "export",
    titleKey: "action.exportMessage",
    icon: "sap-icon://excel-attachment",
    kind: "future",
  },
  {
    id: "copyIds",
    titleKey: "action.copyIds",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "messageId",
  },
  {
    id: "copyHeaders",
    titleKey: "action.copyHeaders",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "headers",
  },
  {
    id: "copyMetadata",
    titleKey: "action.copyMetadata",
    icon: "sap-icon://copy",
    kind: "copy",
    copyField: "metadata",
  },
];
