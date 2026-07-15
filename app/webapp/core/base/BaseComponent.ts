import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import Device from "sap/ui/Device";

/**
 * Abstract base class for the root application component and every lazy-loaded module component.
 *
 * It centralizes two concerns common to all components:
 * - exposing a shared, read-only `device` model for responsive binding,
 * - a consistent content-density CSS class derived from the current device.
 *
 * The root component additionally initializes routing (see the concrete root `Component`); module
 * components inherit only the lightweight helpers here.
 *
 * @namespace com.middlewareops.integrationportal.core.base
 */
export default abstract class BaseComponent extends UIComponent {
  /**
   * Standard component lifecycle hook. Subclasses that override MUST call `super.init()`.
   */
  public init(): void {
    super.init();
    this.setModel(this.createDeviceModel(), "device");
  }

  /**
   * Builds a one-way {@link sap.ui.model.json.JSONModel} exposing {@link sap.ui.Device} state for
   * responsive binding in views.
   * @returns the device model.
   */
  private createDeviceModel(): JSONModel {
    const model = new JSONModel(Device);
    model.setDefaultBindingMode("OneWay");
    return model;
  }

  /**
   * @returns the content-density CSS class appropriate for the current device
   * (`sapUiSizeCompact` on desktop, `sapUiSizeCozy` on touch).
   */
  public getContentDensityClass(): string {
    return Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
  }
}
