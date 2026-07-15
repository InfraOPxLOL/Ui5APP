import { Workspaces, type ShellModuleMetadata, type WorkspaceDefinition } from "./WorkspaceTypes";
import { Icons } from "../../core/constants/Icons";
import { Colors } from "../../core/constants/Colors";
import { RoleCollections, Scopes } from "../permissions/RoleCollections";

/**
 * The default, declarative seed for the {@link module:shell/registry/WorkspaceRegistry}: the
 * workspaces the product ships with and the shell-level metadata assigning each existing module to
 * a workspace (§3–§5). This is pure data — adding or re-homing a module is an edit here (or a
 * runtime `registerModule` call), and no navigation/landing code changes.
 *
 * Every module declared in the frozen `core` ModuleRegistry appears exactly once below, so the two
 * registries stay in lock-step; {@link module:shell/registry/WorkspaceRegistry} asserts this
 * invariant is not silently broken by returning only metadata-backed modules.
 */
export const DEFAULT_WORKSPACES: readonly WorkspaceDefinition[] = [
  {
    id: Workspaces.Operations,
    titleKey: "workspace.operations.title",
    descriptionKey: "workspace.operations.description",
    icon: Icons.workspace.operations,
    themeAccent: Colors.categorical[0],
    order: 10,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["dashboard", "messageMonitoring", "payloadStudio", "alertNotification"],
    defaultRoute: "dashboard",
  },
  {
    id: Workspaces.RetryCenter,
    titleKey: "workspace.retryCenter.title",
    descriptionKey: "workspace.retryCenter.description",
    icon: Icons.workspace.retryCenter,
    themeAccent: Colors.categorical[1],
    order: 20,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["messageReplay", "jmsQueue"],
    defaultRoute: "messageReplay",
  },
  {
    id: Workspaces.RecoveryCenter,
    titleKey: "workspace.recoveryCenter.title",
    descriptionKey: "workspace.recoveryCenter.description",
    icon: Icons.workspace.recoveryCenter,
    themeAccent: Colors.categorical[3],
    order: 25,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["recoveryCenter"],
    defaultRoute: "recoveryCenter",
  },
  {
    id: Workspaces.RuntimeCenter,
    titleKey: "workspace.runtimeCenter.title",
    descriptionKey: "workspace.runtimeCenter.description",
    icon: Icons.workspace.runtimeCenter,
    themeAccent: Colors.categorical[7],
    order: 27,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["runtimeCenter"],
    defaultRoute: "runtimeCenter",
  },
  {
    id: Workspaces.CertificateSecurityCenter,
    titleKey: "workspace.certificateSecurityCenter.title",
    descriptionKey: "workspace.certificateSecurityCenter.description",
    icon: Icons.workspace.certificateSecurityCenter,
    themeAccent: Colors.categorical[2],
    order: 28,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["certificateSecurityCenter"],
    defaultRoute: "certificateSecurityCenter",
  },
  {
    id: Workspaces.Analytics,
    titleKey: "workspace.analytics.title",
    descriptionKey: "workspace.analytics.description",
    icon: Icons.workspace.analytics,
    themeAccent: Colors.categorical[4],
    order: 30,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["analytics", "apiMonitoring"],
    defaultRoute: "analytics",
  },
  {
    id: Workspaces.Governance,
    titleKey: "workspace.governance.title",
    descriptionKey: "workspace.governance.description",
    icon: Icons.workspace.governance,
    themeAccent: Colors.categorical[5],
    order: 40,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["auditView", "roleView", "integrationAdvisor"],
    defaultRoute: "auditView",
  },
  {
    id: Workspaces.Administration,
    titleKey: "workspace.administration.title",
    descriptionKey: "workspace.administration.description",
    icon: Icons.workspace.administration,
    themeAccent: Colors.categorical[6],
    order: 60,
    permission: { allScopes: [Scopes.AdministrationManage] },
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: ["administration"],
    defaultRoute: "administration",
  },
  {
    id: Workspaces.CoE,
    titleKey: "workspace.coe.title",
    descriptionKey: "workspace.coe.description",
    icon: Icons.workspace.coe,
    themeAccent: Colors.categorical[7],
    order: 50,
    showOnLanding: true,
    showInSidebar: true,
    moduleIds: [
      "coeAdmin",
      "coeRouter",
      "coeRegistry",
      "coeDlq",
      "coeRuleBuilder",
      "coePartnerDashboard",
    ],
    defaultRoute: "coeRouter",
  },
];

/**
 * Shell metadata for every module, keyed 1:1 with the frozen core ModuleRegistry. Module-level
 * permission gates mirror the scopes already declared in `xs-security.json` and on the existing
 * module definitions (e.g. Message Replay requires `MessageReplay.Execute`).
 */
export const DEFAULT_MODULE_METADATA: readonly ShellModuleMetadata[] = [
  // Operations
  {
    moduleId: "dashboard",
    workspace: Workspaces.Operations,
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "messageMonitoring",
    workspace: Workspaces.Operations,
    permission: { anyRoleCollection: [RoleCollections.MessageViewer] },
    navigationOrder: 20,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "payloadStudio",
    workspace: Workspaces.Operations,
    permission: { anyRoleCollection: [RoleCollections.PayloadViewer] },
    navigationOrder: 25,
    // Opened only from within the Message Investigation Workspace (never a direct destination) —
    // absent from the sidebar and the landing page, but still a fully addressable, permission-gated
    // route (RouteGuard authorizes by permission, independent of sidebar/landing visibility).
    showLandingCard: false,
    showInSidebar: false,
  },
  {
    moduleId: "alertNotification",
    workspace: Workspaces.Operations,
    navigationOrder: 40,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Retry Center
  {
    moduleId: "messageReplay",
    workspace: Workspaces.RetryCenter,
    permission: { allScopes: [Scopes.MessageReplayExecute] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "jmsQueue",
    workspace: Workspaces.RetryCenter,
    navigationOrder: 20,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Recovery Center
  {
    moduleId: "recoveryCenter",
    workspace: Workspaces.RecoveryCenter,
    permission: { anyRoleCollection: [RoleCollections.RecoveryViewer] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Runtime Center
  {
    moduleId: "runtimeCenter",
    workspace: Workspaces.RuntimeCenter,
    permission: { anyRoleCollection: [RoleCollections.RuntimeViewer] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Certificate & Security Center
  {
    moduleId: "certificateSecurityCenter",
    workspace: Workspaces.CertificateSecurityCenter,
    permission: { anyRoleCollection: [RoleCollections.CertificateViewer] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Analytics
  {
    moduleId: "analytics",
    workspace: Workspaces.Analytics,
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "apiMonitoring",
    workspace: Workspaces.Analytics,
    navigationOrder: 20,
    showLandingCard: true,
    showInSidebar: true,
  },
  // Governance
  {
    moduleId: "auditView",
    workspace: Workspaces.Governance,
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "roleView",
    workspace: Workspaces.Governance,
    navigationOrder: 20,
    showLandingCard: false,
    showInSidebar: true,
  },
  {
    moduleId: "integrationAdvisor",
    workspace: Workspaces.Governance,
    navigationOrder: 30,
    showLandingCard: false,
    showInSidebar: true,
  },
  // Administration
  {
    moduleId: "administration",
    workspace: Workspaces.Administration,
    permission: { allScopes: [Scopes.AdministrationManage] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  // CoE Framework
  {
    moduleId: "coeAdmin",
    workspace: Workspaces.CoE,
    permission: { allScopes: [Scopes.AdministrationManage] },
    navigationOrder: 10,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    // Developer / operational tiles — general visibility (spec §2), so no permission gate.
    moduleId: "coeRouter",
    workspace: Workspaces.CoE,
    navigationOrder: 20,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "coeRegistry",
    workspace: Workspaces.CoE,
    navigationOrder: 40,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "coeDlq",
    workspace: Workspaces.CoE,
    navigationOrder: 50,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "coeRuleBuilder",
    workspace: Workspaces.CoE,
    navigationOrder: 60,
    showLandingCard: true,
    showInSidebar: true,
  },
  {
    moduleId: "coePartnerDashboard",
    workspace: Workspaces.CoE,
    navigationOrder: 45,
    showLandingCard: true,
    showInSidebar: true,
  },
];
