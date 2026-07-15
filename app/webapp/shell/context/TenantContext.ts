import AppEventBus from "../../core/events/AppEventBus";
import type TenantModel from "../../core/models/TenantModel";
import type { TenantConfig } from "../../core/types/AppConfig";

/**
 * The tenant context service (§11) — the shell-level authority for "which tenant am I looking at"
 * and for switching it.
 *
 * It wraps the frozen global {@link TenantModel} (the single source of truth, bound throughout the
 * UI) rather than duplicating its state, and adds the higher-level API the shell chrome uses. A
 * successful {@link switchTenant} lets the model publish `session:tenantChanged`; every dependent
 * subsystem (permissions, module/workspace navigation, monitoring modules) reacts to that one event
 * and reloads — the switch is broadcast, never wired point-to-point (§11).
 */
export default class TenantContext {
  private static instance: TenantContext | undefined;
  private model: TenantModel | undefined;

  private constructor() {
    // Singleton — use TenantContext.getInstance().
  }

  /**
   * @returns the process-wide singleton tenant context.
   */
  public static getInstance(): TenantContext {
    TenantContext.instance ??= new TenantContext();
    return TenantContext.instance;
  }

  /**
   * Binds the context to the global tenant model. Called once during bootstrap after the model is
   * populated from configuration.
   * @param model the global tenant model.
   */
  public initialize(model: TenantModel): void {
    this.model = model;
  }

  /**
   * @returns the currently selected tenant, or `null` before configuration is applied.
   */
  public getCurrentTenant(): TenantConfig | null {
    return (this.requireModel().getProperty("/selected") as TenantConfig | null) ?? null;
  }

  /**
   * @returns the currently selected tenant id ("" before configuration is applied).
   */
  public getCurrentTenantId(): string {
    return this.requireModel().getSelectedTenantId();
  }

  /**
   * @returns all configured tenants (including disabled ones, for admin surfaces).
   */
  public getTenants(): readonly TenantConfig[] {
    return this.requireModel().getProperty("/tenants") as readonly TenantConfig[];
  }

  /**
   * @returns the tenants a user may switch to (enabled only).
   */
  public getSelectableTenants(): readonly TenantConfig[] {
    return this.getTenants().filter((tenant) => tenant.enabled);
  }

  /**
   * Switches the active tenant. Delegates to {@link TenantModel.selectTenant}, which validates the
   * id and, on a real change, broadcasts `session:tenantChanged`.
   * @param tenantId the tenant to switch to.
   * @returns whether the selection changed.
   */
  public switchTenant(tenantId: string): boolean {
    return this.requireModel().selectTenant(tenantId);
  }

  /**
   * Subscribes to tenant changes.
   * @param handler invoked with the new tenant id whenever the tenant switches.
   * @param listener optional `this` context for the handler.
   */
  public onTenantChanged(handler: (tenantId: string) => void, listener?: object): void {
    AppEventBus.getInstance().subscribe(
      "session:tenantChanged",
      (payload) => handler(payload.tenantId),
      listener,
    );
  }

  private requireModel(): TenantModel {
    if (this.model === undefined) {
      throw new Error("TenantContext.initialize() must be called before use.");
    }
    return this.model;
  }
}
