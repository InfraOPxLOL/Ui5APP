import BaseController from "../../core/base/BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import type Event from "sap/ui/base/Event";
import CoeRegistryService from "../../service/coeRegistry/CoeRegistryService";
import CoeRouterService from "../../service/coeRouter/CoeRouterService";
import RegistryModel, {
  type AgreementBoxState,
} from "../../model/coeRegistry/RegistryModel";
import type { RegistryParameter } from "../../service/coeRegistry/CoeRegistryTypes";
import type { AgreementRegistryType } from "../../service/coeRouter/CoeRouterTypes";

const PID_PATTERN = /^[A-Za-z0-9_.]+$/;

/**
 * Controller for the Parameter Registry workspace (spec §2, Tile 3 — 3-box redesign): **JMS
 * Agreements** and **Router Agreements** are read-only sender/receiver pair lookups against the two
 * fixed agreement registries (`_Maintain_JMS_Agreements` / `_Maintain_Router_Agreements`, via
 * `/api/v1/coe-router`); **General Search** keeps the original PID-scoped listing/edit/delete (via
 * `/api/v1/coe-registry`) and adds a reverse "present in" lookup (also `/api/v1/coe-router`) — given
 * a target PID, every agreement entry (plain or `RULESET_`) that routes to it.
 *
 * @namespace com.middlewareops.integrationportal.controller.coeRegistry
 */
export default class RegistryController extends BaseController {
  private readonly registryService = new CoeRegistryService();
  private readonly routerService = new CoeRouterService();
  private loadAbort: AbortController | undefined;
  private jmsLookupAbort: AbortController | undefined;
  private routerLookupAbort: AbortController | undefined;
  private presentInAbort: AbortController | undefined;

  /** Lifecycle hook: installs the view model. */
  public onInit(): void {
    this.setModel(new RegistryModel(), "view");
  }

  /** Lifecycle hook: aborts any in-flight requests. */
  public onExit(): void {
    this.loadAbort?.abort();
    this.jmsLookupAbort?.abort();
    this.routerLookupAbort?.abort();
    this.presentInAbort?.abort();
  }

  // --- Box 1 / Box 2: JMS + Router Agreements (read-only pair lookup) ------------------------------

  /** Looks up the JMS agreement for the entered sender/receiver pair. */
  public onLookupJms(): void {
    void this.lookupAgreement("jms");
  }

  /** Looks up the Router agreement for the entered sender/receiver pair. */
  public onLookupRouter(): void {
    void this.lookupAgreement("router");
  }

  private async lookupAgreement(type: AgreementRegistryType): Promise<void> {
    const model = this.model();
    const box = model.getProperty(`/${type}`) as AgreementBoxState;
    const sndprn = box.sndprn.trim();
    const rcvprn = box.rcvprn.trim();
    if (sndprn === "" || rcvprn === "") {
      MessageToast.show(this.getText("coeRegistry.lookup.pairRequired"));
      return;
    }
    model.setProperty("/busy", true);
    const priorAbort = type === "jms" ? this.jmsLookupAbort : this.routerLookupAbort;
    priorAbort?.abort();
    const controller = new AbortController();
    if (type === "jms") {
      this.jmsLookupAbort = controller;
    } else {
      this.routerLookupAbort = controller;
    }
    try {
      const mestyp = box.mestyp.trim();
      const result = await this.routerService.lookupAgreement(
        { type, sndprn, rcvprn, mestyp: mestyp !== "" ? mestyp : undefined },
        controller.signal,
      );
      model.setProperty(`/${type}/result`, result);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  // --- Box 3: General Search — mode "byPid" (original PID-scoped listing/edit/delete) --------------

  /** Loads the parameters under the entered Partner ID. */
  public onSearch(): void {
    const pid = (this.model().getProperty("/general/pid") as string).trim();
    if (!PID_PATTERN.test(pid)) {
      MessageToast.show(this.getText("coeRegistry.search.invalid"));
      return;
    }
    void this.load(pid);
  }

  private async load(pid: string): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.loadAbort?.abort();
    const controller = new AbortController();
    this.loadAbort = controller;
    try {
      const list = await this.registryService.list(pid, controller.signal);
      model.setProperty("/general/parameters", [...list.parameters]);
      model.setProperty("/general/loaded", true);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  /** Saves the edited value of one parameter row. */
  public onSaveParameter(event: Event): void {
    const row = RegistryController.rowOf(event);
    if (row !== undefined) {
      void this.saveRow(row);
    }
  }

  private async saveRow(row: RegistryParameter): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      await this.registryService.update({ pid: row.pid, id: row.id, value: row.value });
      MessageToast.show(this.getText("coeRegistry.save.success"));
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /** Deletes one parameter row after confirmation. */
  public onDeleteParameter(event: Event): void {
    const row = RegistryController.rowOf(event);
    if (row === undefined) {
      return;
    }
    MessageBox.confirm(this.getText("coeRegistry.delete.confirm", [row.id]), {
      title: this.getText("coeRegistry.delete.title"),
      onClose: (action: unknown) => {
        if (action === MessageBox.Action.OK) {
          void this.deleteRow(row);
        }
      },
    });
  }

  private async deleteRow(row: RegistryParameter): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    try {
      await this.registryService.remove(row.pid, row.id);
      MessageToast.show(this.getText("coeRegistry.delete.success"));
      await this.load(row.pid);
    } catch (error) {
      this.getErrorHandler().handle(error);
    } finally {
      model.setProperty("/busy", false);
    }
  }

  private static rowOf(event: Event): RegistryParameter | undefined {
    const source = event.getSource() as unknown as {
      getBindingContext(model?: string): { getObject(): unknown } | null | undefined;
    };
    return source.getBindingContext("view")?.getObject() as RegistryParameter | undefined;
  }

  // --- Box 3: General Search — mode "presentIn" (reverse lookup) -----------------------------------

  /** Searches every agreement entry (either registry) that routes to the entered target PID. */
  public onPresentInSearch(): void {
    const pid = (this.model().getProperty("/general/presentInPid") as string).trim();
    if (!PID_PATTERN.test(pid)) {
      MessageToast.show(this.getText("coeRegistry.search.invalid"));
      return;
    }
    void this.presentInSearch(pid);
  }

  private async presentInSearch(pid: string): Promise<void> {
    const model = this.model();
    model.setProperty("/busy", true);
    this.presentInAbort?.abort();
    const controller = new AbortController();
    this.presentInAbort = controller;
    try {
      const result = await this.routerService.presentIn(pid, controller.signal);
      model.setProperty("/general/presentInEntries", [...result.entries]);
      model.setProperty("/general/presentInSearched", true);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.getErrorHandler().handle(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        model.setProperty("/busy", false);
      }
    }
  }

  private model(): JSONModel {
    return this.getModel("view") as JSONModel;
  }
}
