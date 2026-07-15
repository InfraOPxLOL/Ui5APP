import type { WorkspaceId } from "../registry/WorkspaceTypes";
import type { ModuleId } from "../../core/types/Module";

/**
 * Plain view-model shapes the shell and landing views bind to. They are produced by the pure
 * {@link module:shell/model/ShellViewBuilder} from the framework services (navigation, permissions,
 * favorites, quick actions), so both the {@link module:shell/controller/Shell} chrome and the
 * {@link module:shell/landing/controller/Home} landing render from one mapping and never duplicate
 * it. Everything here is already resolved (titles translated, visibility applied) — views stay
 * declarative.
 */

/** A workspace entry in the top-level workspace navigation. */
export interface NavWorkspaceVM {
  readonly id: WorkspaceId;
  readonly title: string;
  readonly icon: string;
  readonly accent: string;
  readonly defaultRoute: string;
  readonly selected: boolean;
}

/** A module entry in the active workspace's sidebar. */
export interface SidebarItemVM {
  readonly moduleId: ModuleId;
  readonly title: string;
  readonly icon: string;
  readonly route: string;
}

/** A rich workspace card on the landing page (§9). */
export interface WorkspaceCardVM {
  readonly id: WorkspaceId;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly accent: string;
  readonly defaultRoute: string;
  /** Number of modules the user can open in this workspace. */
  readonly moduleCount: number;
  readonly favorite: boolean;
  /** Short status label (framework placeholder until modules contribute live status). */
  readonly status: string;
}

/** A recently-visited module card on the landing page. */
export interface ModuleCardVM {
  readonly moduleId: ModuleId;
  readonly title: string;
  readonly icon: string;
  readonly route: string;
  readonly workspaceTitle: string;
  readonly favorite: boolean;
}

/** A quick action rendered in the header menu and on the landing page (§16). */
export interface QuickActionVM {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly kind: string;
  readonly workspaceId?: WorkspaceId;
  readonly route?: string;
  readonly command?: string;
  readonly pinned: boolean;
}

/** A breadcrumb segment (Home ▸ Workspace ▸ Module). */
export interface BreadcrumbVM {
  readonly text: string;
  /** Route to navigate to when the crumb is pressed; empty for the current (last) crumb. */
  readonly route: string;
}

/** A selectable tenant in the header tenant selector. */
export interface TenantOptionVM {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly selected: boolean;
}

/** A system announcement on the landing page (§2). */
export interface AnnouncementVM {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly severity: string;
}
