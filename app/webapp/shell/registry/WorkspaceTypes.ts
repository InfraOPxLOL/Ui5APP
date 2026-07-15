import type { ModuleDefinition, ModuleId } from "../../core/types/Module";
import type { PermissionRequirement } from "../permissions/PermissionTypes";

/**
 * Types describing the **workspace framework** — the layer between the shell and individual modules
 * (architecture: Shell → Workspace → Module). A workspace is an independently-shippable feature
 * area (Operations, Retry Center, Analytics, …) that owns its own navigation, landing card, theme
 * accent and permission gate, and groups one or more modules. These types are the contract the
 * {@link module:shell/registry/WorkspaceRegistry} stores and the navigation/landing surfaces
 * consume — everything is metadata; nothing about a workspace is hardcoded into the shell.
 */

/**
 * Stable workspace identifier. Open (`string`) so future workspaces need no type change;
 * {@link Workspaces} supplies the well-known values.
 */
export type WorkspaceId = string;

/** The well-known workspace identifiers seeded by the default catalogue (§3). */
export const Workspaces = {
  Operations: "operations",
  RetryCenter: "retryCenter",
  RecoveryCenter: "recoveryCenter",
  RuntimeCenter: "runtimeCenter",
  CertificateSecurityCenter: "certificateSecurityCenter",
  Analytics: "analytics",
  Governance: "governance",
  Administration: "administration",
  CoE: "coe",
} as const;

/**
 * Declarative descriptor for a workspace (§4). A workspace owns navigation, a landing card,
 * permissions, a theme accent and its member modules.
 */
export interface WorkspaceDefinition {
  /** Stable workspace id (see {@link Workspaces}). */
  readonly id: WorkspaceId;
  /** i18n key for the workspace title. */
  readonly titleKey: string;
  /** i18n key for the workspace description (landing card body). */
  readonly descriptionKey: string;
  /** SAP icon URI representing the workspace. */
  readonly icon: string;
  /** Theme accent colour (CSS colour) used to tint the workspace's chrome and landing card. */
  readonly themeAccent: string;
  /** Sort order across workspace navigation and the landing grid (ascending). */
  readonly order: number;
  /** Permission gate; when unsatisfied the workspace is hidden everywhere (§12). */
  readonly permission?: PermissionRequirement;
  /** Whether the workspace exposes a landing card on the home page (§9). */
  readonly showOnLanding: boolean;
  /** Whether the workspace appears in the top-level workspace navigation. */
  readonly showInSidebar: boolean;
  /** Member module ids, in declaration order (further ordered by each module's navigationOrder). */
  readonly moduleIds: readonly ModuleId[];
  /** Route to navigate to when the workspace is opened (typically its first module's route). */
  readonly defaultRoute: string;
}

/**
 * Shell-level metadata for a module (§5), layered *over* the frozen
 * {@link module:core/types/Module.ModuleDefinition} (which owns id/title/icon/route/group). This
 * adds the workspace framework's concerns without touching the existing registry: workspace
 * membership, permission gate, feature flag, navigation order, landing/sidebar visibility, and the
 * ids of the module's optional badge and search providers.
 */
export interface ShellModuleMetadata {
  /** The module this metadata augments (matches {@link module:core/types/Module.ModuleId}). */
  readonly moduleId: ModuleId;
  /** The workspace this module belongs to. */
  readonly workspace: WorkspaceId;
  /** Permission gate for the module; unsatisfied ⇒ hidden and its route is guarded (§12). */
  readonly permission?: PermissionRequirement;
  /**
   * Optional feature-flag name (checked against `config.features.flags`). When set and the flag is
   * off, the module is hidden regardless of permissions.
   */
  readonly featureFlag?: string;
  /** Sort order within the workspace's sidebar (ascending). */
  readonly navigationOrder: number;
  /** Whether the module contributes a card to its workspace's landing view. */
  readonly showLandingCard: boolean;
  /** Whether the module appears in the workspace sidebar. */
  readonly showInSidebar: boolean;
  /** Id of a registered badge provider supplying the sidebar/card badge, if any (§5). */
  readonly badgeProviderId?: string;
  /** Id of a registered search provider contributing to global search, if any (§5, §14). */
  readonly searchProviderId?: string;
}

/**
 * A module as the shell sees it: the frozen core {@link ModuleDefinition} (id, title, icon, route,
 * group) merged with its shell {@link ShellModuleMetadata} (workspace, permission, ordering,
 * visibility). Produced by {@link module:shell/registry/WorkspaceRegistry.getRegisteredModules}.
 */
export interface RegisteredModule extends ModuleDefinition, ShellModuleMetadata {}
