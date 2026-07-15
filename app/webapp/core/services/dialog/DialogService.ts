import Fragment from "sap/ui/core/Fragment";
import Dialog from "sap/m/Dialog";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";

/**
 * Configuration for opening a reusable, fragment-based dialog via {@link DialogService.open}.
 */
export interface DialogConfig {
  /** Fully-qualified fragment name to load. */
  readonly fragmentName: string;
  /** Optional data exposed to the fragment under the `dialog` model. */
  readonly data?: Record<string, unknown>;
  /** Optional controller/handler object for fragment event handlers. */
  readonly controller?: object;
}

/**
 * Centralized dialog and message-box service.
 *
 * Modules never author one-off dialog controllers for generic popups; they call this service,
 * which guarantees a uniform lifecycle (busy handling, escape-to-close, focus return, and proper
 * destruction). This is the single implementation of the reusable-popup strategy (architecture §4,
 * §8). Fragments loaded here typically come from `library/fragments`.
 */
export default class DialogService {
  private static instance: DialogService | undefined;

  private constructor() {
    // Singleton — use DialogService.getInstance().
  }

  /**
   * @returns the process-wide singleton dialog service.
   */
  public static getInstance(): DialogService {
    DialogService.instance ??= new DialogService();
    return DialogService.instance;
  }

  /**
   * Loads and opens a fragment-based dialog, wiring an optional data model and destroying the
   * dialog automatically when it closes.
   * @param config the dialog configuration.
   * @returns the opened {@link sap.m.Dialog} instance.
   */
  public async open(config: DialogConfig): Promise<Dialog> {
    const dialog = (await Fragment.load({
      name: config.fragmentName,
      controller: config.controller,
    })) as Dialog;

    if (config.data !== undefined) {
      dialog.setModel(new JSONModel(config.data), "dialog");
    }
    dialog.attachAfterClose(() => dialog.destroy());
    dialog.open();
    return dialog;
  }

  /**
   * Shows a standardized confirmation dialog.
   * @param message the confirmation prompt.
   * @param title the dialog title.
   * @returns a promise resolving to `true` when confirmed, `false` otherwise.
   */
  public confirm(message: string, title: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      MessageBox.confirm(message, {
        title,
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: (action: unknown) => resolve(action === MessageBox.Action.OK),
      });
    });
  }

  /**
   * Registers a control as a dependent of a host so it inherits models and is cleaned up with the
   * host view.
   * @param host the host control.
   * @param dependent the dependent control.
   */
  public addDependent(host: Control, dependent: Control): void {
    host.addDependent(dependent);
  }
}
