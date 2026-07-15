import { Workspaces, type WorkspaceId } from "../registry/WorkspaceTypes";
import { Icons } from "../../core/constants/Icons";
import { Scopes } from "../permissions/RoleCollections";
import type { PermissionRequirement } from "../permissions/PermissionTypes";
import type PermissionEngine from "../permissions/PermissionEngine";

/**
 * What a quick action does when invoked. All are declarative so the shell can render and dispatch
 * them generically; no quick action carries executable logic in this framework layer (§16).
 * - `openWorkspace` — activate the workspace named by {@link QuickActionDefinition.workspaceId}.
 * - `navigate` — navigate to the route named by {@link QuickActionDefinition.route}.
 * - `command` — raise the well-known shell command named by {@link QuickActionDefinition.command}
 *   (e.g. open the tenant selector); the shell controller maps commands to chrome behaviour.
 */
export type QuickActionKind = "openWorkspace" | "navigate" | "command";

/** Well-known shell command identifiers a `command` quick action may raise. */
export const ShellCommands = {
  SwitchTenant: "switchTenant",
  OpenSearch: "openSearch",
  OpenNotifications: "openNotifications",
} as const;

/** Declarative definition of a reusable quick action (§16). */
export interface QuickActionDefinition {
  /** Stable action id. */
  readonly id: string;
  /** i18n key for the action label. */
  readonly titleKey: string;
  /** SAP icon URI. */
  readonly icon: string;
  /** Sort order across quick-action surfaces (ascending). */
  readonly order: number;
  /** What invoking the action does. */
  readonly kind: QuickActionKind;
  /** Target workspace id (for `openWorkspace`). */
  readonly workspaceId?: WorkspaceId;
  /** Target route name (for `navigate`). */
  readonly route?: string;
  /** Shell command id (for `command`). */
  readonly command?: string;
  /** Permission gate; unsatisfied ⇒ the action is hidden (§16, §12). */
  readonly permission?: PermissionRequirement;
}

/** The quick actions the product ships with (§16). Extended at runtime via {@link QuickActionRegistry.register}. */
const DEFAULT_ACTIONS: readonly QuickActionDefinition[] = [
  {
    id: "openOperations",
    titleKey: "quickAction.openOperations",
    icon: Icons.workspace.operations,
    order: 10,
    kind: "openWorkspace",
    workspaceId: Workspaces.Operations,
  },
  {
    id: "openRetryCenter",
    titleKey: "quickAction.openRetryCenter",
    icon: Icons.workspace.retryCenter,
    order: 20,
    kind: "openWorkspace",
    workspaceId: Workspaces.RetryCenter,
  },
  {
    id: "openAnalytics",
    titleKey: "quickAction.openAnalytics",
    icon: Icons.workspace.analytics,
    order: 30,
    kind: "openWorkspace",
    workspaceId: Workspaces.Analytics,
  },
  {
    id: "switchTenant",
    titleKey: "quickAction.switchTenant",
    icon: Icons.shell.tenant,
    order: 40,
    kind: "command",
    command: ShellCommands.SwitchTenant,
  },
  {
    id: "openAdministration",
    titleKey: "quickAction.openAdministration",
    icon: Icons.workspace.administration,
    order: 50,
    kind: "openWorkspace",
    workspaceId: Workspaces.Administration,
    permission: { allScopes: [Scopes.AdministrationManage] },
  },
];

/**
 * The registry of reusable quick actions (§16). Framework only — it stores declarative actions and
 * filters them by permission; the shell renders and dispatches them. Future modules contribute
 * actions with {@link register} (overwriting by id) without touching existing code.
 */
export default class QuickActionRegistry {
  private static instance: QuickActionRegistry | undefined;
  private readonly actions = new Map<string, QuickActionDefinition>();

  private constructor() {
    this.seedDefaults();
  }

  /**
   * @returns the process-wide singleton quick-action registry.
   */
  public static getInstance(): QuickActionRegistry {
    QuickActionRegistry.instance ??= new QuickActionRegistry();
    return QuickActionRegistry.instance;
  }

  /**
   * Registers (or replaces by id) a quick action.
   * @param action the action to register.
   */
  public register(action: QuickActionDefinition): void {
    this.actions.set(action.id, action);
  }

  /**
   * @returns all registered quick actions, ascending by {@link QuickActionDefinition.order}.
   */
  public getActions(): readonly QuickActionDefinition[] {
    return [...this.actions.values()].sort((a, b) => a.order - b.order);
  }

  /**
   * @param engine the permission engine for the current user.
   * @returns the quick actions the user is permitted to see, in order (§12).
   */
  public getAuthorizedActions(engine: PermissionEngine): readonly QuickActionDefinition[] {
    return this.getActions().filter((action) => engine.isSatisfied(action.permission));
  }

  /**
   * Restores the registry to its seeded defaults. Intended for test isolation.
   */
  public reset(): void {
    this.actions.clear();
    this.seedDefaults();
  }

  private seedDefaults(): void {
    for (const action of DEFAULT_ACTIONS) {
      this.actions.set(action.id, action);
    }
  }
}
