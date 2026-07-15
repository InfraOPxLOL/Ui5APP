import BaseObject from "sap/ui/base/Object";
import Fragment from "sap/ui/core/Fragment";
import Dialog from "sap/m/Dialog";
import Control from "sap/ui/core/Control";
import View from "sap/ui/core/mvc/View";
import Model from "sap/ui/model/Model";

/**
 * Abstract base class for module-specific dialog controllers (e.g. an "edit destination" form).
 *
 * Generic, content-less dialogs (confirm, detail popover) are opened via the shared
 * {@link module:com/middlewareops/integrationportal/core/services/dialog/DialogService}; this base
 * exists for the exception noted in the architecture — dialogs that carry real form logic — giving
 * them a consistent load/open/close/destroy lifecycle and automatic dependency wiring to a host
 * view.
 *
 * @namespace com.middlewareops.integrationportal.core.base
 */
export default abstract class BaseDialogController extends BaseObject {
  private dialog: Dialog | undefined;

  /** Fragment name to load, e.g. `com.middlewareops.integrationportal.modules.administration.fragment.EditDestination`. */
  protected abstract readonly fragmentName: string;

  /**
   * @param host the view that owns this dialog (used for dependency wiring and model inheritance).
   */
  protected constructor(protected readonly host: View) {
    super();
  }

  /**
   * Lazily loads (once) and opens the dialog, optionally binding a local model.
   * @param modelName name under which to expose {@link model} on the dialog.
   * @param model optional model to set on the dialog before opening.
   */
  public async open(modelName?: string, model?: Model): Promise<void> {
    if (this.dialog === undefined) {
      this.dialog = (await Fragment.load({
        id: this.host.getId(),
        name: this.fragmentName,
        controller: this,
      })) as Dialog;
      this.host.addDependent(this.dialog as unknown as Control);
    }
    if (model !== undefined) {
      this.dialog.setModel(model, modelName);
    }
    this.dialog.open();
  }

  /**
   * Closes the dialog if it is open.
   */
  public close(): void {
    this.dialog?.close();
  }

  /**
   * Destroys the dialog and releases its resources.
   */
  public destroy(): void {
    this.dialog?.destroy();
    this.dialog = undefined;
  }

  /**
   * @returns the underlying dialog instance, if loaded.
   */
  protected getDialog(): Dialog | undefined {
    return this.dialog;
  }
}
