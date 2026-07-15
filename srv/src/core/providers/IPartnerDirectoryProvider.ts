import type {
  PartnerDirectoryBinaryParameter,
  PartnerDirectoryStringParameter,
  ProviderContext,
} from "./types.js";

/**
 * Read/write access to an Integration Suite tenant's Partner Directory string parameters
 * (`StringParameters` entity set, OData v2, key `(Pid, Id)`).
 *
 * The first provider in this SDK that performs *writes* against the tenant beyond JMS message
 * actions — backing the CoE Framework's configuration surfaces (global settings, queue matrix,
 * agreement rulesets). Writes require a CSRF handshake on CPI; implementations handle it at this
 * boundary so no caller ever deals with tokens.
 */
export interface IPartnerDirectoryProvider {
  /**
   * Reads one string parameter.
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @returns the parameter, or `undefined` when it does not exist.
   */
  getStringParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryStringParameter | undefined>;

  /**
   * Lists every string parameter belonging to one Partner ID (used to test whether an "agreement"
   * PID exists and who owns it — see the CoE Route Wizard's collision check).
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @returns the parameters under `pid`; empty when the PID has none (i.e. does not exist).
   */
  listStringParameters(
    context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryStringParameter[]>;

  /**
   * Creates or updates one string parameter (create when absent, update when present).
   * @param context the tenant/correlation context.
   * @param parameter the parameter to persist (`pid` + `id` + `value`).
   * @returns the persisted parameter as read back from the tenant.
   */
  upsertStringParameter(
    context: ProviderContext,
    parameter: { readonly pid: string; readonly id: string; readonly value: string },
  ): Promise<PartnerDirectoryStringParameter>;

  /**
   * Deletes one string parameter. A no-op (resolves normally) when the parameter does not exist.
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   */
  deleteStringParameter(context: ProviderContext, pid: string, id: string): Promise<void>;

  /**
   * Reads one binary parameter (`BinaryParameters` entity set — see {@link PartnerDirectoryBinaryParameter}).
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   * @returns the parameter, or `undefined` when it does not exist.
   */
  getBinaryParameter(
    context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryBinaryParameter | undefined>;

  /**
   * Lists every binary parameter belonging to one Partner ID.
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @returns the parameters under `pid`; empty when the PID has none.
   */
  listBinaryParameters(
    context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryBinaryParameter[]>;

  /**
   * Creates or updates one binary parameter (create when absent, update when present).
   * @param context the tenant/correlation context.
   * @param parameter the parameter to persist (`pid` + `id` + `contentType` + base64 `valueBase64`).
   * @returns the persisted parameter as read back from the tenant.
   */
  upsertBinaryParameter(
    context: ProviderContext,
    parameter: {
      readonly pid: string;
      readonly id: string;
      readonly contentType: string;
      readonly valueBase64: string;
    },
  ): Promise<PartnerDirectoryBinaryParameter>;

  /**
   * Deletes one binary parameter. A no-op (resolves normally) when the parameter does not exist.
   * @param context the tenant/correlation context.
   * @param pid the owning Partner ID.
   * @param id the parameter id within the partner.
   */
  deleteBinaryParameter(context: ProviderContext, pid: string, id: string): Promise<void>;
}
