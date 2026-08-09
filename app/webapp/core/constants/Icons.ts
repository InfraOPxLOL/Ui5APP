/**
 * Central registry of every SAP icon used from TypeScript code, so an icon is chosen once and
 * reused consistently (architecture: "every icon should come from SAP UI5", Phase-3 constants
 * mandate). Declarative XML views reference `sap-icon://` URIs directly (XML cannot import
 * constants); all programmatic icon selection resolves through this registry.
 */
export const Icons = {
  /** Module icons, keyed by module id (used by the shell's ModuleRegistry). */
  module: {
    dashboard: "sap-icon://home",
    messageMonitoring: "sap-icon://message-information",
    payloadStudio: "sap-icon://source-code",
    recoveryCenter: "sap-icon://synchronize",
    runtimeCenter: "sap-icon://chain-link",
    certificateSecurityCenter: "sap-icon://it-security",
    jmsQueue: "sap-icon://combine",
    messageReplay: "sap-icon://redo",
    alertNotification: "sap-icon://bell",
    auditView: "sap-icon://history",
    roleView: "sap-icon://role",
    administration: "sap-icon://settings",
    apiMonitoring: "sap-icon://connected",
    integrationAdvisor: "sap-icon://lightbulb",
    analytics: "sap-icon://bar-chart",
    coeAdmin: "sap-icon://official-service",
    coePartnersRoutes: "sap-icon://org-chart",
    coeRouter: "sap-icon://chain-link",
    coeRegistry: "sap-icon://tree",
    coeDlq: "sap-icon://alert",
    coeRuleBuilder: "sap-icon://workflow-tasks",
    coePartnerDashboard: "sap-icon://master-detail",
  },
  /** Action icons shared across toolbars and buttons. */
  action: {
    refresh: "sap-icon://refresh",
    export: "sap-icon://excel-attachment",
    filter: "sap-icon://filter",
    search: "sap-icon://search",
    settings: "sap-icon://action-settings",
    download: "sap-icon://download",
    copy: "sap-icon://copy",
    retry: "sap-icon://redo",
    delete: "sap-icon://delete",
    detail: "sap-icon://detail-view",
    navigate: "sap-icon://navigation-right-arrow",
  },
  /** Status icons (colour semantics come from StatusFormatter / value states). */
  status: {
    success: "sap-icon://sys-enter-2",
    error: "sap-icon://error",
    warning: "sap-icon://warning",
    information: "sap-icon://information",
    processing: "sap-icon://process",
    unknown: "sap-icon://question-mark",
  },
  /** Shell chrome icons. */
  shell: {
    menu: "sap-icon://menu2",
    notifications: "sap-icon://bell",
    user: "sap-icon://person-placeholder",
    group: "sap-icon://group-2",
    tenant: "sap-icon://cloud",
    home: "sap-icon://home",
    search: "sap-icon://search",
    favorite: "sap-icon://favorite",
    favoriteEmpty: "sap-icon://unfavorite",
    quickAction: "sap-icon://action",
    announcement: "sap-icon://marketing-campaign",
    dismiss: "sap-icon://decline",
    history: "sap-icon://history",
  },
  /** Workspace icons, keyed by workspace id (used by the WorkspaceRegistry catalogue). */
  workspace: {
    operations: "sap-icon://activities",
    retryCenter: "sap-icon://redo",
    recoveryCenter: "sap-icon://synchronize",
    runtimeCenter: "sap-icon://workflow-tasks",
    certificateSecurityCenter: "sap-icon://it-security",
    analytics: "sap-icon://business-objects-experience",
    governance: "sap-icon://compliance",
    certificates: "sap-icon://key",
    administration: "sap-icon://settings",
    coe: "sap-icon://official-service",
  },
} as const;
