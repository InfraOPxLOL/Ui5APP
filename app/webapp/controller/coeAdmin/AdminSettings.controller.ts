import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CoeAdminService from "../../service/coeAdmin/CoeAdminService";
import CoeAdminFormatter from "../../formatter/coeAdmin/CoeAdminFormatter";
import AdminSettingsModel, {
  DRAFT_DEFAULTS,
  type CoeSettingsDraft,
} from "../../model/coeAdmin/AdminSettingsModel";
import type { CoeGlobalSettings } from "../../service/coeAdmin/CoeAdminTypes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Controller for the CoE Admin workspace (spec §3 — Global Framework Configurations).
 *
 * Presents the four `.SYS_JMS_FRAMEWORK` global settings as an immutable display that becomes
 * editable only in an explicit edit session, validates every field per spec, and publishes changes
 * behind a confirmation dialog. Consumes **only** `/api/v1/coe-admin` (itself composed entirely from
 * the Operations Engine); it never talks to the SDK or knows an Integration Suite endpoint.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeAdmin
 */
export default class AdminSettingsController extends BaseController {
  private readonly service = new CoeAdminService();
  private loadAbort: AbortController | undefined;

  /** Exposed for formatter bindings in the view. */
  public formatDateTime(value: string | undefined): string {
    return CoeAdminFormatter.dateTime(value);
  }

  /**
   * Lifecycle hook: installs the view model and loads the settings on every visit to the route
   * (the pattern-matched handler fires on the initial navigation too, so no separate initial load
   * is needed — a second call here would race and abort the first, surfacing a spurious error).
   */
  public onInit(): void {
    this.setModel(new AdminSettingsModel(), "view");
    this.getRouter()
      .getRoute("coeAdmin")
      ?.attachPatternMatched(() => void this.loadSettings());
  }

  /** Lifecycle hook: aborts any in-flight load. */
  public onExit(): void {
    this.loadAbort?.abort();
  }

  private async loadSettings(): Promise<void> {
    const model = this.model();
    this.loadAbort?.abort();
    const controller = new AbortController();
    this.loadAbort = controller;
    model.setProperty("/busy", true);
    try {
      const settings = await this.service.getGlobalSettings(controller.signal);
      model.setProperty("/settings", settings);
      model.setProperty("/draft", AdminSettingsController.toDraft(settings));
      model.setProperty("/editing", false);
      this.clearValueStates();
      model.setProperty("/loaded", true);
    } catch (error) {
      // A superseded load was aborted by a newer one — that is not a real failure, so stay silent.
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  /** Manual refresh (discards any unsaved edits). */
  public onRefresh(): void {
    void this.loadSettings();
  }

  /** Enters an edit session, seeding the draft from the current settings. */
  public onEdit(): void {
    const settings = this.model().getProperty("/settings") as CoeGlobalSettings;
    this.model().setProperty("/draft", AdminSettingsController.toDraft(settings));
    this.clearValueStates();
    this.model().setProperty("/editing", true);
  }

  /** Cancels the edit session, discarding the draft. */
  public onCancel(): void {
    const settings = this.model().getProperty("/settings") as CoeGlobalSettings;
    this.model().setProperty("/draft", AdminSettingsController.toDraft(settings));
    this.clearValueStates();
    this.model().setProperty("/editing", false);
  }

  /** Live validation for the support-mailbox field. */
  public onMailboxChange(): void {
    const value = this.draft().defaultExceptionTo;
    this.model().setProperty(
      "/valueState/defaultExceptionTo",
      value !== "" && !EMAIL_PATTERN.test(value) ? "Error" : "None",
    );
  }

  /** Live validation for the egress-URI field. */
  public onEgressChange(): void {
    const value = this.draft().defaultEgressUri;
    this.model().setProperty(
      "/valueState/defaultEgressUri",
      value !== "" && !value.startsWith("/") ? "Error" : "None",
    );
  }

  /** Validates the draft, confirms, then publishes the settings. */
  public onSave(): void {
    if (!this.validate()) {
      MessageToast.show(this.getText("coeAdmin.validation.failed"));
      return;
    }
    MessageBox.confirm(this.getText("coeAdmin.confirm.text"), {
      title: this.getText("coeAdmin.confirm.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.publish();
        }
      },
    });
  }

  private async publish(): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      const settings = await this.service.saveGlobalSettings({ ...this.draft() });
      model.setProperty("/settings", settings);
      model.setProperty("/draft", AdminSettingsController.toDraft(settings));
      model.setProperty("/editing", false);
      MessageToast.show(this.getText("coeAdmin.save.success"));
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private validate(): boolean {
    const draft = this.draft();
    const emailOk = EMAIL_PATTERN.test(draft.defaultExceptionTo);
    const egressOk = draft.defaultEgressUri.startsWith("/");
    const retriesOk =
      Number.isInteger(draft.defaultRetries) &&
      draft.defaultRetries >= 1 &&
      draft.defaultRetries <= 10;
    this.model().setProperty("/valueState/defaultExceptionTo", emailOk ? "None" : "Error");
    this.model().setProperty("/valueState/defaultEgressUri", egressOk ? "None" : "Error");
    return emailOk && egressOk && retriesOk && draft.environment !== "";
  }

  private clearValueStates(): void {
    this.model().setProperty("/valueState/defaultExceptionTo", "None");
    this.model().setProperty("/valueState/defaultEgressUri", "None");
  }

  private draft(): CoeSettingsDraft {
    return this.model().getProperty("/draft") as CoeSettingsDraft;
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }

  /** Builds an editable draft from the loaded settings, falling back to defaults for unset fields. */
  private static toDraft(settings: CoeGlobalSettings): CoeSettingsDraft {
    return {
      environment: settings.environment ?? DRAFT_DEFAULTS.environment,
      defaultRetries: settings.defaultRetries ?? DRAFT_DEFAULTS.defaultRetries,
      defaultExceptionTo: settings.defaultExceptionTo ?? DRAFT_DEFAULTS.defaultExceptionTo,
      defaultEgressUri: settings.defaultEgressUri ?? DRAFT_DEFAULTS.defaultEgressUri,
    };
  }
}
