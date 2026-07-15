/**
 * Pure breadcrumb transformations for the Message Monitoring detail page (§ JMS Retry / Expand).
 * Framework-free by design (mirrors `shell/model/ShellViewBuilder`'s own "pure builder" convention)
 * so the 4th-segment append/remove logic is unit-testable without a UI5 view/controller lifecycle.
 */

export interface BreadcrumbEntry {
  readonly text: string;
  readonly route: string;
}

/** `ShellViewBuilder.buildBreadcrumbs` always produces exactly Home ▸ Workspace ▸ Module for a matched module route — the stable base this detail crumb sits on top of. */
const BASE_CRUMB_COUNT = 3;

/**
 * Appends a message-level 4th breadcrumb segment on top of Shell's own Home ▸ Workspace ▸ Module
 * trail, and makes the (previously non-clickable) last crumb clickable again so it can navigate
 * back to the list. Always truncates to the first {@link BASE_CRUMB_COUNT} entries before
 * appending — idempotent whether called again for the same message id or navigating directly from
 * one message's detail page to another's (replaces, never accumulates).
 * @param crumbs the current breadcrumb trail (as built by `ShellViewBuilder.buildBreadcrumbs`).
 * @param messageId the message id to show as the trailing, non-clickable crumb.
 * @returns the new breadcrumb trail.
 */
export function appendDetailCrumb(
  crumbs: readonly BreadcrumbEntry[],
  messageId: string,
): BreadcrumbEntry[] {
  const base = crumbs.slice(0, BASE_CRUMB_COUNT);
  const withClickableModule = base.map((crumb, index) =>
    index === base.length - 1 ? { ...crumb, route: "messageMonitoring" } : crumb,
  );
  return [...withClickableModule, { text: messageId, route: "" }];
}

/**
 * Removes a previously-appended 4th breadcrumb segment, restoring the module crumb's
 * non-clickable "current page" state. A no-op (returns `undefined`) when the trail is already at
 * its base 3-segment length — defensive against being called twice or out of order.
 * @param crumbs the current breadcrumb trail.
 * @returns the restored 3-segment trail, or `undefined` if there was nothing to remove.
 */
export function removeDetailCrumb(
  crumbs: readonly BreadcrumbEntry[],
): BreadcrumbEntry[] | undefined {
  if (crumbs.length <= BASE_CRUMB_COUNT) {
    return undefined;
  }
  const withoutDetail = crumbs.slice(0, -1);
  const last = withoutDetail[withoutDetail.length - 1];
  if (last === undefined) {
    return undefined;
  }
  return [...withoutDetail.slice(0, -1), { ...last, route: "" }];
}
