/**
 * The simulated response behaviours the mock engine can produce for any operation (architecture:
 * Mock Engine, §11).
 *
 * - `success`      — a normal, realistic single-page result.
 * - `empty`        — a valid but empty result (tests empty-state UI).
 * - `slow`         — a normal result, delayed by `slowDelayMs` (tests loading/busy states).
 * - `largePayload` — a much larger-than-typical result (tests virtualization/performance).
 * - `multiPage`    — a large dataset sized so list operations naturally require several pages.
 * - `timeout`      — simulates the upstream never responding in time.
 * - `error`        — simulates the upstream responding with a server error.
 * - `failure`      — simulates a transport/network failure (no response at all).
 */
export type MockScenario =
  | "success"
  | "empty"
  | "slow"
  | "largePayload"
  | "multiPage"
  | "timeout"
  | "error"
  | "failure";

/**
 * Configuration for the {@link MockEngine} (architecture: Mock Engine, §11 — "Mock mode should be
 * enabled through configuration"). The SDK itself never reads `config/*.json`; the composition root
 * translates whatever configuration source it uses into this shape.
 */
export interface MockEngineConfig {
  /** Master switch; when `false`, `MockEngine.resolve` is not expected to be called at all. */
  readonly enabled: boolean;
  /** Scenario applied when an operation has no override. */
  readonly defaultScenario: MockScenario;
  /** Per-operation scenario overrides, keyed by operation key (e.g. `monitoring.queryMessageLogs`). */
  readonly scenarioOverrides?: Readonly<Record<string, MockScenario>>;
  /** Delay applied by the `slow` scenario, in milliseconds (default 3000). */
  readonly slowDelayMs?: number;
  /** Item count used by the `largePayload`/`multiPage` scenarios (default 5000 / 250 respectively). */
  readonly largePayloadItemCount?: number;
  readonly multiPageItemCount?: number;
}
