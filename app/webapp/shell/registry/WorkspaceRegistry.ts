import {
  type RegisteredModule,
  type ShellModuleMetadata,
  type WorkspaceDefinition,
  type WorkspaceId,
} from "./WorkspaceTypes";
import { DEFAULT_MODULE_METADATA, DEFAULT_WORKSPACES } from "./WorkspaceCatalog";
import ModuleRegistry from "../model/ModuleRegistry";
import type { ModuleDefinition, ModuleId } from "../../core/types/Module";

/**
 * The single, metadata-driven registry of workspaces and module→workspace assignments (§4, §5).
 *
 * It sits *beside* the frozen core {@link ModuleRegistry} (which still owns each module's
 * id/title/icon/route/group) and layers the workspace framework on top: workspace definitions and
 * the shell metadata assigning modules to workspaces. It is **pure** — it knows nothing about the
 * current user, permissions or config enablement; the {@link module:shell/navigation/NavigationService}
 * resolves visibility against those. Keeping it pure makes both independently testable (§19).
 *
 * Registration is open: a future workspace or module registers by calling {@link registerWorkspace}
 * / {@link registerModule} at bootstrap (overwriting any same-id entry), so nothing already in the
 * registry needs editing to extend it.
 */
export default class WorkspaceRegistry {
  private static instance: WorkspaceRegistry | undefined;

  private readonly workspaces = new Map<WorkspaceId, WorkspaceDefinition>();
  private readonly moduleMetadata = new Map<ModuleId, ShellModuleMetadata>();

  private constructor() {
    this.seedDefaults();
  }

  /**
   * @returns the process-wide singleton registry.
   */
  public static getInstance(): WorkspaceRegistry {
    WorkspaceRegistry.instance ??= new WorkspaceRegistry();
    return WorkspaceRegistry.instance;
  }

  /**
   * Registers (or replaces by id) a workspace definition.
   * @param definition the workspace to register.
   */
  public registerWorkspace(definition: WorkspaceDefinition): void {
    this.workspaces.set(definition.id, definition);
  }

  /**
   * Registers (or replaces by module id) shell metadata for a module.
   * @param metadata the module metadata to register.
   */
  public registerModule(metadata: ShellModuleMetadata): void {
    this.moduleMetadata.set(metadata.moduleId, metadata);
  }

  /**
   * @returns all workspace definitions, ascending by {@link WorkspaceDefinition.order}.
   */
  public getWorkspaces(): readonly WorkspaceDefinition[] {
    return [...this.workspaces.values()].sort((a, b) => a.order - b.order);
  }

  /**
   * @param id the workspace id.
   * @returns the workspace definition, or `undefined` when not registered.
   */
  public getWorkspace(id: WorkspaceId): WorkspaceDefinition | undefined {
    return this.workspaces.get(id);
  }

  /**
   * @param moduleId the module id.
   * @returns the module's shell metadata, or `undefined` when not registered.
   */
  public getModuleMetadata(moduleId: ModuleId): ShellModuleMetadata | undefined {
    return this.moduleMetadata.get(moduleId);
  }

  /**
   * Merges every module's frozen core definition with its shell metadata.
   * @returns the registered modules; only modules that have both a core definition and shell
   * metadata are included, so a partially-registered module never leaks a half-formed entry.
   */
  public getRegisteredModules(): readonly RegisteredModule[] {
    const byId = new Map<ModuleId, ModuleDefinition>(
      ModuleRegistry.getAll().map((definition) => [definition.id, definition]),
    );
    const merged: RegisteredModule[] = [];
    for (const metadata of this.moduleMetadata.values()) {
      const definition = byId.get(metadata.moduleId);
      if (definition !== undefined) {
        merged.push({ ...definition, ...metadata });
      }
    }
    return merged;
  }

  /**
   * @param workspaceId the workspace id.
   * @returns the workspace's registered modules, ascending by
   * {@link ShellModuleMetadata.navigationOrder}.
   */
  public getModulesForWorkspace(workspaceId: WorkspaceId): readonly RegisteredModule[] {
    return this.getRegisteredModules()
      .filter((module) => module.workspace === workspaceId)
      .sort((a, b) => a.navigationOrder - b.navigationOrder);
  }

  /**
   * Restores the registry to its seeded defaults, discarding runtime registrations. Intended for
   * tests so cases do not leak workspace/module registrations into one another.
   */
  public reset(): void {
    this.workspaces.clear();
    this.moduleMetadata.clear();
    this.seedDefaults();
  }

  private seedDefaults(): void {
    for (const workspace of DEFAULT_WORKSPACES) {
      this.workspaces.set(workspace.id, workspace);
    }
    for (const metadata of DEFAULT_MODULE_METADATA) {
      this.moduleMetadata.set(metadata.moduleId, metadata);
    }
  }
}
