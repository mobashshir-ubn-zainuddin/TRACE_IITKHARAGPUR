/**
 * Temporal alignment (Tests 13-14, Task 9).
 *
 * The lead/lag semantics are exercised through the pure `evaluateLagAlignment`
 * so the expected lag is known by construction rather than inferred from data.
 */

import { evaluateLagAlignment, calculateTemporalAlignment } from "../temporal";
import { DEFAULT_DRIVER_CONFIG } from "../config";
import type { MovementPoint } from "../stats";

/** Build a movement series over consecutive months starting 2025-01. */
function series(values: number[], offsetMonths = 0): MovementPoint[] {
  return values.map((deltaPct, i) => {
    const d = new Date(2025, 0 + i + offsetMonths, 1);
    return { period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, deltaPct };
  });
}

// A distinctive, non-periodic pattern so the correct lag is unambiguous.
const PATTERN = [5, -3, 8, -6, 2, 9, -4, 7, -1, 3, 6, -8];

describe("Test 13 - positive temporal lead", () => {
  it("recovers L=+1 when the driver moves one month BEFORE the KPI", () => {
    // KPI at month t equals driver at month t-1  =>  driver leads by 1.
    const kpi = series(PATTERN, 1);
    const driver = series(PATTERN, 0);

    const r = evaluateLagAlignment(kpi, driver)!;
    expect(r.bestLag).toBe(1);
    expect(r.lagDirection).toBe("leads");
    expect(Math.abs(r.lagCorrelation)).toBeCloseTo(1, 6);
  });

  it("gives a leading driver full temporal credit", () => {
    const r = evaluateLagAlignment(series(PATTERN, 1), series(PATTERN, 0))!;
    // leads => factor 1.0, so score == |r|
    expect(r.temporalScore).toBeCloseTo(Math.abs(r.lagCorrelation), 6);
    expect(r.temporalScore).toBeGreaterThan(0.9);
  });

  it("recovers L=+2 for a two-month lead", () => {
    const r = evaluateLagAlignment(series(PATTERN, 2), series(PATTERN, 0))!;
    expect(r.bestLag).toBe(2);
    expect(r.lagDirection).toBe("leads");
  });
});

describe("Test 14 - reverse temporal lag", () => {
  it("recovers L=-1 when the driver moves one month AFTER the KPI", () => {
    // Driver at month t equals KPI at month t-1  =>  driver follows by 1.
    const kpi = series(PATTERN, 0);
    const driver = series(PATTERN, 1);

    const r = evaluateLagAlignment(kpi, driver)!;
    expect(r.bestLag).toBe(-1);
    expect(r.lagDirection).toBe("lags");
  });

  it("penalises a following driver so it cannot claim strong temporal support", () => {
    const lagging = evaluateLagAlignment(series(PATTERN, 0), series(PATTERN, 1))!;
    const leading = evaluateLagAlignment(series(PATTERN, 1), series(PATTERN, 0))!;

    // Same |r| by construction, but very different temporal support.
    expect(Math.abs(lagging.lagCorrelation)).toBeCloseTo(Math.abs(leading.lagCorrelation), 6);
    expect(lagging.temporalScore).toBeLessThan(leading.temporalScore);
    expect(lagging.temporalScore).toBeCloseTo(
      Math.abs(lagging.lagCorrelation) * DEFAULT_DRIVER_CONFIG.temporalAlignment.lagsPenaltyFactor,
      6
    );
  });

  it("searches negative lags at all", () => {
    // The old implementation scanned only 0..+3 and could never report a lag.
    const r = evaluateLagAlignment(series(PATTERN, 0), series(PATTERN, 2))!;
    expect(r.bestLag).toBeLessThan(0);
    expect(r.lagProfile!.map((p) => p.lag)).toEqual(expect.arrayContaining([-3, -2, -1, 0, 1, 2, 3]));
  });

  it("discounts contemporaneous movement relative to a lead", () => {
    const contemporaneous = evaluateLagAlignment(series(PATTERN, 0), series(PATTERN, 0))!;
    expect(contemporaneous.bestLag).toBe(0);
    expect(contemporaneous.lagDirection).toBe("contemporaneous");
    expect(contemporaneous.temporalScore).toBeCloseTo(
      Math.abs(contemporaneous.lagCorrelation) *
        DEFAULT_DRIVER_CONFIG.temporalAlignment.contemporaneousFactor,
      6
    );
  });

  it("returns null when no lag has enough paired observations", () => {
    expect(evaluateLagAlignment(series([1, 2]), series([3, 4]))).toBeNull();
  });
});

describe("Task 9 - temporal alignment on real data", () => {
  it("classifies lag direction and never returns a bare zero for supported drivers", async () => {
    const t = await calculateTemporalAlignment("revenue", "discount", "2026-08", { region: "North" });
    expect(t.insufficientData).toBe(false);
    expect(["leads", "contemporaneous", "lags"]).toContain(t.lagDirection);
    expect(t.bestLag).toBeGreaterThanOrEqual(DEFAULT_DRIVER_CONFIG.temporalAlignment.minLagMonths);
    expect(t.bestLag).toBeLessThanOrEqual(DEFAULT_DRIVER_CONFIG.temporalAlignment.maxLagMonths);
    expect(t.sampleSize).toBeGreaterThan(0);
  });

  it("abstains explicitly for a driver with no resolver", async () => {
    const t = await calculateTemporalAlignment("revenue", "refunds", "2026-08", { region: "North" });
    expect(t.insufficientData).toBe(true);
    expect(t.temporalScore).toBe(0);
    expect(t.reason).toMatch(/refund column/i);
  });
});
