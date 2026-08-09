import ResourceModel from "sap/ui/model/resource/ResourceModel";

/**
 * Per-module i18n bundle resolution (architecture §15 — "i18n is per-module and never inherited").
 *
 * In the single-root-Component, layer-first layout every module keeps its own bundle at
 * `i18n/<moduleId>/i18n.properties`, and a view may only resolve `{i18n>key}` bindings from its own
 * module's bundle. Referencing another module's key renders the literal key string with **no error**
 * — a silent failure that has cost real debugging time more than once, so the resolution rule lives
 * in exactly one place here.
 *
 * Two callers need it, which is why it is a shared utility rather than a `Component` private:
 * - {@link module:Component}'s `applyModuleI18n`, on every route match, for the *routed* target view;
 * - any host view that embeds another module's view as a nested `XMLView` (the tabbed
 *   `coePartnersRoutes` shell). Nested views are **not** routed targets, so the router-driven hook
 *   never fires for them and they would otherwise inherit — and render keys from — the host's bundle.
 *
 * Models are cached per module id: a `ResourceModel` is comparatively expensive and is safe to share
 * across every view of the same module.
 */

/** Cache of one {@link ResourceModel} per module id, built on first use. */
const models = new Map<string, ResourceModel>();

/**
 * Resolves (and caches) the i18n `ResourceModel` for one module.
 * @param moduleId the module folder name, e.g. `coeRegistry` — the `<moduleId>` in
 *   `i18n/<moduleId>/i18n.properties`.
 * @returns the shared resource model to attach to a view under the `"i18n"` model name.
 */
export function getModuleI18nModel(moduleId: string): ResourceModel {
  let model = models.get(moduleId);
  if (model === undefined) {
    model = new ResourceModel({
      bundleName: `com.middlewareops.integrationportal.i18n.${moduleId}.i18n`,
      supportedLocales: [""],
      fallbackLocale: "",
    });
    models.set(moduleId, model);
  }
  return model;
}

/**
 * Extracts the module id embedded in a view name (`….view.<moduleId>.<Name>`).
 * @param viewName the fully-qualified view name.
 * @returns the module id, or `undefined` when the name is not a module view (shell/home views).
 */
export function moduleIdFromViewName(viewName: string): string | undefined {
  return /\.view\.([^.]+)\./.exec(viewName)?.[1];
}
