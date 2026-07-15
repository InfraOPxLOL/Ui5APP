import type { IPartnerDirectoryProvider } from "../../core/providers/IPartnerDirectoryProvider.js";
import type {
  PartnerDirectoryBinaryParameter,
  PartnerDirectoryStringParameter,
  ProviderContext,
} from "../../core/providers/types.js";

/** Master CoE Partner ID whose global settings the mock is seeded with. */
const SYS_PID = ".SYS_JMS_FRAMEWORK";

/** Seed values so mock mode + unit tests have a realistic, writable `.SYS_JMS_FRAMEWORK`. */
const SEED: readonly PartnerDirectoryStringParameter[] = [
  {
    pid: SYS_PID,
    id: "Environment",
    value: "DEV",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
  {
    pid: SYS_PID,
    id: "DEFAULT_RETRIES",
    value: "5",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
  {
    pid: SYS_PID,
    id: "Default_Exception_To",
    value: "coe-support@middlewareops.com",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
  {
    pid: SYS_PID,
    id: "X-Default-Egress-URI",
    value: "/ProcessDirect/CatchAll",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
  // A pre-existing JMS agreement pointing at a different partner, so the Route Wizard's collision
  // check has a "ruleset" case to resolve against. Agreements are string parameters under the fixed
  // `_Maintain_JMS_Agreements` registry PID, keyed `.{SNDPRN}.{RCVPRN}`, valued with the target PID.
  {
    pid: "_Maintain_JMS_Agreements",
    id: ".SHOPIFY.S4HANA",
    value: "PID_EXISTING_OWNER",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
  // The Common Router analogue: a pre-existing router agreement pointing at a different Common Router
  // package, so the Common Router flow's collision check has a "ruleset" case to resolve against.
  {
    pid: "_Maintain_Router_Agreements",
    id: ".SHOPIFY.S4HANA",
    value: "Common_Router_Existing",
    lastModifiedBy: "mock",
    lastModifiedAt: undefined,
  },
];

/**
 * Mock implementation of {@link IPartnerDirectoryProvider} (architecture: Provider Framework, §10).
 * Unlike the read-only mock providers, this one is stateful: an in-memory store (per client
 * instance) seeded with the `.SYS_JMS_FRAMEWORK` global settings, so the create/update path is
 * genuinely exercisable in mock mode and unit tests without hitting a tenant.
 */
export class MockPartnerDirectoryProvider implements IPartnerDirectoryProvider {
  private readonly store = new Map<string, PartnerDirectoryStringParameter>();
  private readonly binaryStore = new Map<string, PartnerDirectoryBinaryParameter>();

  public constructor() {
    for (const parameter of SEED) {
      this.store.set(MockPartnerDirectoryProvider.key(parameter.pid, parameter.id), parameter);
    }
  }

  /** @inheritdoc */
  public getStringParameter(
    _context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryStringParameter | undefined> {
    return Promise.resolve(this.store.get(MockPartnerDirectoryProvider.key(pid, id)));
  }

  /** @inheritdoc */
  public listStringParameters(
    _context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryStringParameter[]> {
    const items = [...this.store.values()].filter((parameter) => parameter.pid === pid);
    return Promise.resolve(items);
  }

  /** @inheritdoc */
  public upsertStringParameter(
    _context: ProviderContext,
    parameter: { readonly pid: string; readonly id: string; readonly value: string },
  ): Promise<PartnerDirectoryStringParameter> {
    const persisted: PartnerDirectoryStringParameter = {
      pid: parameter.pid,
      id: parameter.id,
      value: parameter.value,
      lastModifiedBy: "mock",
      lastModifiedAt: new Date().toISOString(),
    };
    this.store.set(MockPartnerDirectoryProvider.key(parameter.pid, parameter.id), persisted);
    return Promise.resolve(persisted);
  }

  /** @inheritdoc */
  public deleteStringParameter(_context: ProviderContext, pid: string, id: string): Promise<void> {
    this.store.delete(MockPartnerDirectoryProvider.key(pid, id));
    return Promise.resolve();
  }

  /** @inheritdoc */
  public getBinaryParameter(
    _context: ProviderContext,
    pid: string,
    id: string,
  ): Promise<PartnerDirectoryBinaryParameter | undefined> {
    return Promise.resolve(this.binaryStore.get(MockPartnerDirectoryProvider.key(pid, id)));
  }

  /** @inheritdoc */
  public listBinaryParameters(
    _context: ProviderContext,
    pid: string,
  ): Promise<readonly PartnerDirectoryBinaryParameter[]> {
    const items = [...this.binaryStore.values()].filter((parameter) => parameter.pid === pid);
    return Promise.resolve(items);
  }

  /** @inheritdoc */
  public upsertBinaryParameter(
    _context: ProviderContext,
    parameter: {
      readonly pid: string;
      readonly id: string;
      readonly contentType: string;
      readonly valueBase64: string;
    },
  ): Promise<PartnerDirectoryBinaryParameter> {
    const persisted: PartnerDirectoryBinaryParameter = {
      pid: parameter.pid,
      id: parameter.id,
      contentType: parameter.contentType,
      valueBase64: parameter.valueBase64,
      lastModifiedBy: "mock",
      lastModifiedAt: new Date().toISOString(),
    };
    this.binaryStore.set(MockPartnerDirectoryProvider.key(parameter.pid, parameter.id), persisted);
    return Promise.resolve(persisted);
  }

  /** @inheritdoc */
  public deleteBinaryParameter(_context: ProviderContext, pid: string, id: string): Promise<void> {
    this.binaryStore.delete(MockPartnerDirectoryProvider.key(pid, id));
    return Promise.resolve();
  }

  private static key(pid: string, id: string): string {
    return `${pid} ${id}`;
  }
}
