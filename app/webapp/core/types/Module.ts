/**
 * Shared type definitions describing a navigable application module.
 *
 * These types are the contract between the {@link module:com/middlewareops/integrationportal/shell/model/ModuleRegistry}
 * (which declares the modules) and the shell navigation (which renders them). Adding a module is a
 * data change against these types — no shell code needs to change.
 */

/**
 * Stable, unique identifier for a module. Must match:
 * - the routing route/target name in the root `manifest.json` (a `type: View` target),
 * - the module key in `config/features.json`'s `modules` map,
 * - the `<module>` subfolder name under each layer folder (`controller/<id>/`, `view/<id>/`, …).
 */
export type ModuleId =
  | "dashboard"
  | "messageMonitoring"
  | "payloadStudio"
  | "recoveryCenter"
  | "runtimeCenter"
  | "certificateSecurityCenter"
  | "jmsQueue"
  | "messageReplay"
  | "alertNotification"
  | "auditView"
  | "roleView"
  | "administration"
  | "apiMonitoring"
  | "integrationAdvisor"
  | "analytics"
  | "coeAdmin"
  | "coeRouter"
  | "coeRegistry"
  | "coeDlq"
  | "coeRuleBuilder"
  | "coePartnerDashboard";

/**
 * Logical grouping used to cluster modules into sidebar sections.
 */
export type ModuleGroup = "monitoring" | "operations" | "governance" | "administration";

/**
 * Declarative descriptor for a single module, consumed by the shell to build navigation.
 */
export interface ModuleDefinition {
  /** Stable module identifier (see {@link ModuleId}). */
  readonly id: ModuleId;
  /** i18n key resolving to the sidebar/nav title. */
  readonly titleKey: string;
  /** SAP icon URI (e.g. `sap-icon://message-error`). */
  readonly icon: string;
  /** Routing route name to navigate to (matches `manifest.json` routes). */
  readonly route: string;
  /** Sidebar grouping. */
  readonly group: ModuleGroup;
  /** Delivery phase, for documentation/roadmap surfacing (20+ = CoE Framework era). */
  readonly phase: 1 | 2 | 3 | 10 | 11 | 12 | 13 | 20;
  /** XSUAA scope required to see this module at all, if any. */
  readonly requiredScope?: string;
}

/**
 * A {@link ModuleDefinition} enriched at runtime with whether it is enabled via `config.json`.
 */
export interface ResolvedModule extends ModuleDefinition {
  readonly enabled: boolean;
}
