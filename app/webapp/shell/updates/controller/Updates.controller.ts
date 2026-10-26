import JSONModel from "sap/ui/model/json/JSONModel";
import type Event from "sap/ui/base/Event";
import BaseController from "../../../core/base/BaseController";
import AppEventBus from "../../../core/events/AppEventBus";
import { RouteNames } from "../../../core/constants/RouteNames";
import { DateTimeFormatter } from "../../../core/formatters";
import UpdatesService, { type UpdatesFilter } from "../UpdatesService";
import type { UpdateItem, UpdateType } from "../ReleaseNotes";

interface UpdatesState {
  filter: { type: string; area: string; query: string };
  releases: unknown[];
  countText: string;
}

const TYPE_STATE: Readonly<Record<UpdateType, string>> = {
  new: "Success",
  improved: "Information",
  fixed: "Warning",
};

/**
 * The Updates page: every change to the portal since its first version, newest first, filterable by
 * kind (new, improved, fixed), area and words. Releases the user has not seen are marked; opening the
 * page counts as seeing them. A shell page like Home — no workspace, available to everyone.
 *
 * @namespace com.middlewareops.integrationportal.shell.updates.controller
 */
export default class UpdatesController extends BaseController {
  public readonly fmt = {
    date: (iso?: string): string => DateTimeFormatter.formatDate(iso),
    typeText: (type?: UpdateType): string => (type ? this.getText(`updates.type.${type}`) : ""),
    typeState: (type?: UpdateType): string => (type ? TYPE_STATE[type] : "None"),
    areaText: (area?: string): string => (area ? this.getText(`updates.area.${area}`) : ""),
  };

  private readonly updates = new UpdatesService();

  public onInit(): void {
    const state: UpdatesState = {
      filter: { type: "", area: "", query: "" },
      releases: [],
      countText: "",
    };
    this.setModel(new JSONModel(state), "updates");
    this.getRouter()
      .getRoute(RouteNames.Updates)
      ?.attachPatternMatched(() => {
        // Show what is new first, then record it as seen for the bell and the home page.
        this.applyFilter();
        this.updates.markSeen();
        AppEventBus.getInstance().publish("context:updatesSeen", {});
      });
  }

  public onFilterChange(): void {
    this.applyFilter();
  }

  /** Opens the screen a change is about. */
  public onOpen(event: Event): void {
    const source = event.getSource() as unknown as {
      getBindingContext(name: string): { getObject(): unknown } | null | undefined;
    };
    const item = source.getBindingContext("updates")?.getObject() as UpdateItem | undefined;
    if (item?.route !== undefined) {
      this.getRouter().navTo(item.route);
    }
  }

  private applyFilter(): void {
    const model = this.getModel("updates") as JSONModel;
    const filter = model.getProperty("/filter") as UpdatesFilter;
    const releases = this.updates.filtered(filter);
    model.setProperty("/releases", releases);
    model.setProperty(
      "/countText",
      this.getText("updates.count", [
        releases.reduce((count, release) => count + release.items.length, 0),
        releases.length,
      ]),
    );
  }
}
