import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  severityOfStatus,
  humanReadableStatus,
  calculateDurationMs,
  formatDurationHuman,
  daysRemaining,
  certificateHealth,
  runtimeHealth,
  queueHealth,
  clampUtilization,
  formatBytesHuman,
  countByValue,
  topRanked,
} from "../../../src/operations/transform/index.js";

describe("operations/transform/StatusTransform", () => {
  it("maps known statuses to severities", () => {
    assert.equal(severityOfStatus("FAILED"), "error");
    assert.equal(severityOfStatus("escalated"), "critical");
    assert.equal(severityOfStatus("COMPLETED"), "info");
    assert.equal(severityOfStatus("processing"), "info");
    assert.equal(severityOfStatus("SOME_UNKNOWN_STATUS"), "warning");
  });

  it("humanizes upper-snake-case statuses", () => {
    assert.equal(humanReadableStatus("MANUAL_REVIEW_REQUIRED"), "Manual Review Required");
    assert.equal(humanReadableStatus("FAILED"), "Failed");
  });
});

describe("operations/transform/DurationTransform", () => {
  it("calculates elapsed milliseconds", () => {
    assert.equal(calculateDurationMs("2024-01-01T00:00:00.000Z", "2024-01-01T00:00:01.500Z"), 1500);
    assert.equal(calculateDurationMs("2024-01-01T00:00:00.000Z", undefined), undefined);
  });

  it("formats durations at every scale", () => {
    assert.equal(formatDurationHuman(undefined), "In progress");
    assert.equal(formatDurationHuman(340), "340 ms");
    assert.equal(formatDurationHuman(12_400), "12.4 s");
    assert.equal(formatDurationHuman(190_000), "3.2 min");
    assert.equal(formatDurationHuman(4_000_000), "1.1 h");
  });
});

describe("operations/transform/HealthTransform", () => {
  it("computes days remaining and certificate health", () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const farFuture = new Date(Date.now() + 400 * 86_400_000).toISOString();
    assert.ok(daysRemaining(future) <= 10 && daysRemaining(future) >= 9);
    assert.equal(certificateHealth(past), "critical");
    assert.equal(certificateHealth(future), "warning");
    assert.equal(certificateHealth(farFuture), "healthy");
  });

  it("scores runtime health from status", () => {
    assert.equal(runtimeHealth("STARTED"), "healthy");
    assert.equal(runtimeHealth("ERROR"), "critical");
    assert.equal(runtimeHealth("DEPLOYING"), "warning");
  });

  it("scores queue health and clamps utilization", () => {
    assert.equal(queueHealth(95), "critical");
    assert.equal(queueHealth(75), "warning");
    assert.equal(queueHealth(10), "healthy");
    assert.equal(clampUtilization(150), 100);
    assert.equal(clampUtilization(-10), 0);
  });
});

describe("operations/transform/SizeTransform", () => {
  it("formats byte counts at every unit", () => {
    assert.equal(formatBytesHuman(undefined), "Unknown size");
    assert.equal(formatBytesHuman(482), "482 B");
    assert.equal(formatBytesHuman(12_400), "12.1 KB");
    assert.equal(formatBytesHuman(3_200_000), "3.1 MB");
  });
});

describe("operations/transform/AggregationTransform", () => {
  it("countByValue groups and counts", () => {
    const counts = countByValue(["a", "b", "a", "c", "a"], (v) => v);
    assert.deepEqual(
      counts.sort((x, y) => x.value.localeCompare(y.value)),
      [
        { value: "a", count: 3 },
        { value: "b", count: 1 },
        { value: "c", count: 1 },
      ],
    );
  });

  it("topRanked returns the top N by count, descending", () => {
    const ranked = topRanked(["a", "b", "a", "c", "a", "b"], (v) => v, 2);
    assert.deepEqual(ranked, [
      { key: "a", count: 3 },
      { key: "b", count: 2 },
    ]);
  });
});
