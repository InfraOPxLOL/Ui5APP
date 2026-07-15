import JSONModel from "sap/ui/model/json/JSONModel";
import AppEventBus from "../events/AppEventBus";
import type { TenantConfig } from "../types/AppConfig";

/** Shape of the tenant model. */
export interface TenantState {
  tenants: readonly TenantConfig[];
  selectedTenantId: string;
  selected: TenantConfig | null;
}

/**
 * Global tenant model: the configured tenants and the current selection. The architecture is
 * multi-tenant from day one — every data request carries the selected tenant id — even while a
 * single tenant is configured. Switching publishes `session:tenantChanged` on the event bus so
 * modules can reload without any coupling to the shell. Owned by the root component (model name
 * `tenant`).
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class TenantModel extends JSONModel {
  public constructor() {
    const initial: TenantState = { tenants: [], selectedTenantId: "", selected: null };
    super(initial);
  }

  /**
   * Populates the model from loaded configuration and selects the default tenant.
   * @param tenants all configured tenants.
   * @param defaultTenant the tenant to select initially.
   */
  public applyConfig(tenants: readonly TenantConfig[], defaultTenant: TenantConfig): void {
    this.setData({
      tenants,
      selectedTenantId: defaultTenant.id,
      selected: defaultTenant,
    } satisfies TenantState);
  }

  /**
   * Switches the selected tenant and announces the change on the event bus.
   * @param tenantId the tenant to select; unknown or disabled ids are ignored.
   * @returns whether the selection changed.
   */
  public selectTenant(tenantId: string): boolean {
    const tenants = this.getProperty("/tenants") as readonly TenantConfig[];
    const tenant = tenants.find((t) => t.id === tenantId && t.enabled);
    if (tenant === undefined || tenantId === this.getSelectedTenantId()) {
      return false;
    }
    this.setProperty("/selectedTenantId", tenant.id);
    this.setProperty("/selected", tenant);
    AppEventBus.getInstance().publish("session:tenantChanged", { tenantId: tenant.id });
    return true;
  }

  /**
   * @returns the currently selected tenant id ("" before configuration is applied).
   */
  public getSelectedTenantId(): string {
    return this.getProperty("/selectedTenantId") as string;
  }
}
