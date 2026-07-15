import ComponentContainer from "sap/ui/core/ComponentContainer";

/**
 * Application bootstrap entry point referenced by `index.html`
 * (`data-sap-ui-on-init`). It mounts the root {@link module:com/middlewareops/integrationportal/Component}
 * inside a full-height {@link sap.ui.core.ComponentContainer} and places it into the page body.
 *
 * Keeping bootstrap in a dedicated module (rather than inline in `index.html`) means the entry
 * point is itself TypeScript and participates in the same transpile/lint pipeline as the rest of
 * the app.
 */
new ComponentContainer({
  name: "com.middlewareops.integrationportal",
  settings: {
    id: "integrationPortal",
  },
  async: true,
  manifest: true,
  height: "100%",
}).placeAt("content");
