import { configService, type AppConfig } from "./ConfigService.js";
import type { TenantConfig } from "./schemas/index.js";

/**
 * Compatibility facade over the Phase-3 configuration framework.
 *
 * Phase 1 exposed a single `config` object loaded from one `config.json`; Phase 3 replaced that
 * file with the per-domain files under `config/` loaded by {@link ConfigService}. This module keeps
 * the original import site (`config/config.js`) alive as a thin delegation layer so existing
 * consumers keep compiling, but **new code must import {@link configService} directly** — the
 * typed getters are the supported API surface.
 *
 * @deprecated Import `configService` from `./ConfigService.js` instead.
 */

/** The full composed configuration set (immutable). */
export const config: AppConfig = configService.getAll();

/**
 * Resolves a tenant configuration by id, or the default tenant when no id is given.
 * @param tenantId optional tenant id.
 * @returns the matching tenant configuration.
 * @throws {ConfigurationError} when no matching, enabled tenant exists.
 * @deprecated Use `configService.getTenant(tenantId)` instead.
 */
export function resolveTenant(tenantId?: string): TenantConfig {
  return configService.getTenant(tenantId);
}
