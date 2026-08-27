/**
 * Pure statistical primitives (Tests 9-12).
 * No database access -- every expectation is checkable by hand.
 */

import {
  pearsonCorrelation,
  spearmanCorrelation,
  correlationPValue,
  studentTTwoTailedP,
  rankWithTies,
  toMovementSeries,
  alignMovementSeries,
} from "../stats";

const P = (period: string, value: number, hasData = true) => ({ period, value, hasData });

describe("Test 9 - Pearson correlation", () => {
  it("returns +1 for a perfect positive linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 12);
  });

  it("returns -1 for a perfect negative linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it("matches a hand-computed value", () => {
    // x=[1,2,3,4,5] y=[2,1,4,3,5]
    // dx=[-2,-1,0,1,2] dy=[-1,-2,1,0,2]; Sxy=8, Sxx=10, Syy=10 -> r = 8/10 = 0.8
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 10);
  });

  it("returns null rather than 0 when a series has zero variance", () => {
    // Critical: 0 would be indistinguishable from a measured null result.
    expect(pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
  });

  it("returns null when there are too few observations", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull();
  });

  it("is bounded to [-1, 1]", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5, 6], [3, 1, 4, 1, 5, 9])!;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe("Test 10 - Spearman correlation", () => {
  it("returns +1 for a monotonic but non-linear relationship", () => {
    // Pearson would be < 1 here; Spearman is exactly 1.
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 12);
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])!).toBeLessThan(1);
  });

  it("returns -1 for a monotonically decreasing relationship", () => {
    expect(spearmanCorrelation([1, 2, 3, 4, 5], [100, 50, 25, 10, 1])).toBeCloseTo(-1, 12);
  });

  it("assigns averaged mid-ranks to ties", () => {
    // values 10,20,20,30 -> ranks 1, 2.5, 2.5, 4
    expect(rankWithTies([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("handles tied inputs without producing NaN", () => {
    const rho = spearmanCorrelation([1, 2, 2, 3, 4], [1, 2, 3, 3, 4]);
    expect(rho).not.toBeNull();
    expect(Number.isFinite(rho!)).toBe(true);
  });
});

describe("Test 11 - correlation p-value", () => {
  it("matches reference two-tailed Student t values", () => {
    // Reference: 2*pt(-abs(t), df)
    expect(studentTTwoTailedP(2.228, 10)!).toBeCloseTo(0.05, 4);
    expect(studentTTwoTailedP(3.169, 10)!).toBeCloseTo(0.01, 4);
    expect(studentTTwoTailedP(0, 5)!).toBeCloseTo(1.0, 10);
  });

  it("matches reference p-values for correlations", () => {
    // r=0.8, n=10 -> t=3.7712, df=8 -> p=0.005453
    expect(correlationPValue(0.8, 10)!).toBeCloseTo(0.005453, 5);
    expect(correlationPValue(0.5, 12)!).toBeCloseTo(0.097855, 5);  // t=1.8257, df=10
    expect(correlationPValue(0.1, 30)!).toBeCloseTo(0.599048, 5);  // t=0.53182, df=28
  });

  it("is symmetric in the sign of r", () => {
    expect(correlationPValue(0.6, 15)!).toBeCloseTo(correlationPValue(-0.6, 15)!, 12);
  });

  it("decreases as |r| grows at fixed n", () => {
    const weak = correlationPValue(0.2, 20)!;
    const strong = correlationPValue(0.8, 20)!;
    expect(strong).toBeLessThan(weak);
  });

  it("decreases as n grows at fixed r", () => {
    expect(correlationPValue(0.5, 40)!).toBeLessThan(correlationPValue(0.5, 8)!);
  });

  it("returns 0 for perfect correlation and null for degenerate input", () => {
    expect(correlationPValue(1, 10)).toBe(0);
    expect(correlationPValue(0.5, 2)).toBeNull();
  });
});

describe("Test 12 - insufficient correlation history", () => {
  it("builds a movement series from levels", () => {
    const mv = toMovementSeries([P("2026-01", 100), P("2026-02", 110), P("2026-03", 99)]);
    expect(mv).toEqual([
      { period: "2026-02", deltaPct: 10 },
      { period: "2026-03", deltaPct: -10 },
    ]);
  });

  it("drops observations with a zero denominator instead of emitting Infinity", () => {
    const mv = toMovementSeries([P("2026-01", 0), P("2026-02", 50), P("2026-03", 100)]);
    expect(mv.map((m) => m.period)).toEqual(["2026-03"]);
    expect(mv.every((m) => Number.isFinite(m.deltaPct))).toBe(true);
  });

  it("drops observations where either endpoint lacks data", () => {
    const mv = toMovementSeries([P("2026-01", 100), P("2026-02", 0, false), P("2026-03", 120)]);
    expect(mv).toHaveLength(0);
  });

  it("yields an empty series from a single period", () => {
    expect(toMovementSeries([P("2026-01", 100)])).toHaveLength(0);
  });

  it("aligns two movement series on shared periods only", () => {
    const a = [{ period: "2026-02", deltaPct: 1 }, { period: "2026-03", deltaPct: 2 }];
    const b = [{ period: "2026-03", deltaPct: 9 }, { period: "2026-04", deltaPct: 8 }];
    expect(alignMovementSeries(a, b)).toEqual({ periods: ["2026-03"], x: [2], y: [9] });
  });
});
