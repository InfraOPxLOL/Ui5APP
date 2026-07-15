/**
 * The declarative catalogue of XSUAA scopes and role collections the shell reasons about.
 *
 * The **source of truth** for what a user may do is always the set of scopes minted into their
 * XSUAA JWT (surfaced to the frontend by `SessionService.getUser().scopes`). This file does not
 * invent a parallel authorization system — it only names the scopes and expresses each role
 * collection as the bundle of scopes it grants, mirroring `xs-security.json`'s role-template
 * → scope-reference wiring. The backend remains the final authority on every request
 * (architecture §14).
 *
 * Two families of role collection are declared:
 * - the collections actually provisioned today in `xs-security.json`
 *   (`IntegrationPortal_Viewer` / `_Operator` / `_Administrator`), and
 * - the finer-grained `PI_*` collections the product roadmap targets (§7). Because the security
 *   descriptor is frozen, each `PI_*` collection is expressed here in terms of the **real** scopes
 *   that exist today; provisioning the matching XSUAA role collections is a deployment concern, not
 *   a code change. New collections are added by extending {@link ROLE_COLLECTIONS} — no engine code
 *   changes.
 */

/**
 * The XSUAA scopes declared in `xs-security.json` (short names, without the `$XSAPPNAME.` prefix,
 * exactly as `SessionService` surfaces them). This is the complete, frozen scope vocabulary.
 */
export const Scopes = {
  Viewer: "Viewer",
  Operator: "Operator",
  Administrator: "Administrator",
  MessageReplayExecute: "MessageReplay.Execute",
  JmsQueuePurge: "JmsQueue.Purge",
  AdministrationManage: "Administration.Manage",
} as const;

/** Union of all known scope short-names. */
export type Scope = (typeof Scopes)[keyof typeof Scopes];

/**
 * Stable identifiers for every role collection the shell knows about. Includes both the currently
 * provisioned `IntegrationPortal_*` collections and the roadmap `PI_*` collections (§7). Treated as
 * an open vocabulary: {@link RoleCollectionId} is `string`-assignable so future collections need no
 * type change, while these constants give call-sites autocomplete and typo-safety.
 */
export const RoleCollections = {
  // Currently provisioned in xs-security.json.
  IntegrationPortalViewer: "IntegrationPortal_Viewer",
  IntegrationPortalOperator: "IntegrationPortal_Operator",
  IntegrationPortalAdministrator: "IntegrationPortal_Administrator",

  // Roadmap collections (§7) — expressed against today's real scopes until provisioned.
  OperationsViewer: "PI_OPERATIONS_VIEWER",
  OperationsAdmin: "PI_OPERATIONS_ADMIN",
  MessageViewer: "PI_MESSAGE_VIEWER",
  MessageAdmin: "PI_MESSAGE_ADMIN",
  PayloadViewer: "PI_PAYLOAD_VIEWER",
  PayloadAdmin: "PI_PAYLOAD_ADMIN",
  RetryOperator: "PI_RETRY_OPERATOR",
  RetryAdmin: "PI_RETRY_ADMIN",
  AnalyticsViewer: "PI_ANALYTICS_VIEWER",
  AnalyticsAdmin: "PI_ANALYTICS_ADMIN",
  GovernanceViewer: "PI_GOVERNANCE_VIEWER",
  GovernanceAdmin: "PI_GOVERNANCE_ADMIN",
  CertificateViewer: "PI_CERTIFICATE_VIEWER",
  CertificateAdmin: "PI_CERTIFICATE_ADMIN",
  RecoveryViewer: "PI_RECOVERY_VIEWER",
  RecoveryAdmin: "PI_RECOVERY_ADMIN",
  RuntimeViewer: "PI_RUNTIME_VIEWER",
  RuntimeAdmin: "PI_RUNTIME_ADMIN",
  Admin: "PI_ADMIN",
} as const;

/**
 * A role collection identifier. Open (`string`) by design so future collections require no type
 * change, while {@link RoleCollections} supplies the well-known values.
 */
export type RoleCollectionId = string;

/**
 * Declarative definition of a role collection: the scopes it grants and, optionally, other
 * collections whose scopes it inherits (permission inheritance / permission groups, §6).
 */
export interface RoleCollectionDefinition {
  /** Stable collection identifier (see {@link RoleCollections}). */
  readonly id: RoleCollectionId;
  /** Human-readable description (English default; surfaced in admin/context tooling). */
  readonly description: string;
  /** Scopes granted directly by this collection. */
  readonly scopes: readonly Scope[];
  /** Other collections whose granted scopes this collection also confers. */
  readonly inherits?: readonly RoleCollectionId[];
}

/**
 * The full catalogue of role-collection definitions. Adding a collection is a single entry here;
 * the {@link module:shell/permissions/PermissionEngine} resolves inheritance and scope membership
 * generically.
 */
export const ROLE_COLLECTIONS: readonly RoleCollectionDefinition[] = [
  {
    id: RoleCollections.IntegrationPortalViewer,
    description: "Integration Portal — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.IntegrationPortalOperator,
    description: "Integration Portal — Operator",
    scopes: [Scopes.Operator, Scopes.MessageReplayExecute, Scopes.JmsQueuePurge],
    inherits: [RoleCollections.IntegrationPortalViewer],
  },
  {
    id: RoleCollections.IntegrationPortalAdministrator,
    description: "Integration Portal — Administrator",
    scopes: [Scopes.Administrator, Scopes.AdministrationManage],
    inherits: [RoleCollections.IntegrationPortalOperator],
  },

  // Roadmap PI_* collections, mapped onto today's real scopes.
  {
    id: RoleCollections.OperationsViewer,
    description: "Operations — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.OperationsAdmin,
    description: "Operations — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.OperationsViewer],
  },
  {
    id: RoleCollections.MessageViewer,
    description: "Message monitoring — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.MessageAdmin,
    description: "Message monitoring — Administrator",
    scopes: [Scopes.Operator, Scopes.MessageReplayExecute],
    inherits: [RoleCollections.MessageViewer],
  },
  {
    id: RoleCollections.PayloadViewer,
    description: "Payload — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.PayloadAdmin,
    description: "Payload — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.PayloadViewer],
  },
  {
    id: RoleCollections.RetryOperator,
    description: "Retry — Operator",
    scopes: [Scopes.Operator, Scopes.MessageReplayExecute],
    inherits: [RoleCollections.OperationsViewer],
  },
  {
    id: RoleCollections.RetryAdmin,
    description: "Retry — Administrator",
    scopes: [Scopes.JmsQueuePurge],
    inherits: [RoleCollections.RetryOperator],
  },
  {
    id: RoleCollections.AnalyticsViewer,
    description: "Analytics — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.AnalyticsAdmin,
    description: "Analytics — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.AnalyticsViewer],
  },
  {
    id: RoleCollections.GovernanceViewer,
    description: "Governance — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.GovernanceAdmin,
    description: "Governance — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.GovernanceViewer],
  },
  {
    id: RoleCollections.CertificateViewer,
    description: "Certificates — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.CertificateAdmin,
    description: "Certificates — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.CertificateViewer],
  },
  {
    id: RoleCollections.RecoveryViewer,
    description: "Recovery Center — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.RecoveryAdmin,
    description: "Recovery Center — Administrator",
    scopes: [Scopes.JmsQueuePurge],
    inherits: [RoleCollections.RecoveryViewer, RoleCollections.RetryOperator],
  },
  {
    id: RoleCollections.RuntimeViewer,
    description: "Runtime Center — Viewer",
    scopes: [Scopes.Viewer],
  },
  {
    id: RoleCollections.RuntimeAdmin,
    description: "Runtime Center — Administrator",
    scopes: [Scopes.Operator],
    inherits: [RoleCollections.RuntimeViewer],
  },
  {
    id: RoleCollections.Admin,
    description: "Platform Administrator — all scopes",
    scopes: [
      Scopes.Viewer,
      Scopes.Operator,
      Scopes.Administrator,
      Scopes.MessageReplayExecute,
      Scopes.JmsQueuePurge,
      Scopes.AdministrationManage,
    ],
  },
];
