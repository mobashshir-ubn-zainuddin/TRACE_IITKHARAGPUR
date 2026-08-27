/**
 * Decomposition reconciliation (Tests 1-4) and the product-mix split (Task 6).
 * Runs against the real database.
 */

import {
  shapleyTwoFactorChange,
  contributionShares,
  calculateRevenueDecomposition,
  calculateDriverContributions,
  calculateDimensionContribution,
  calculateProductMixDecomposition,
} from "../contribution";

const PERIOD = "2026-08";
const NORTH = { region: "North" };

describe("Test 1 - Revenue Shapley reconciliation", () => {
  it("splits the interaction evenly and reconciles exactly (algebraic)", () => {
    const O0 = 100, O1 = 120, A0 = 50, A1 = 40;
    const r = shapleyTwoFactorChange(O0 * A0, O1 * A0, O0 * A1, O1 * A1);

    // phi_orders = 0.5 * [(f10-f00) + (f11-f01)]
    expect(r.factor1).toBeCloseTo(0.5 * ((O1 * A0 - O0 * A0) + (O1 * A1 - O0 * A1)), 10);
    // phi_aov = 0.5 * [(f01-f00) + (f11-f10)]
    expect(r.factor2).toBeCloseTo(0.5 * ((O0 * A1 - O0 * A0) + (O1 * A1 - O1 * A0)), 10);

    expect(r.totalChange).toBeCloseTo(O1 * A1 - O0 * A0, 10);
    expect(r.factor1 + r.factor2).toBeCloseTo(r.totalChange, 10);
    expect(Math.abs(r.reconciliationError)).toBeLessThanOrEqual(1e-9);
    expect(r.reconciles).toBe(true);
  });

  it("is order-independent, unlike sequential decomposition", () => {
    const O0 = 100, O1 = 120, A0 = 50, A1 = 40;
    const r = shapleyTwoFactorChange(O0 * A0, O1 * A0, O0 * A1, O1 * A1);

    // Sequential decomposition depends on which factor is substituted first.
    const ordersFirst = (O1 - O0) * A0;
    const ordersLast = (O1 - O0) * A1;
    expect(ordersFirst).not.toBeCloseTo(ordersLast, 6);
    // Shapley is exactly the average of the two orderings.
    expect(r.factor1).toBeCloseTo((ordersFirst + ordersLast) / 2, 10);
  });

  it("reconciles on real data and reports interaction as allocated, not absent", async () => {
    const d = await calculateRevenueDecomposition("revenue", PERIOD, NORTH);
    expect(d.reconciles).toBe(true);
    expect(Math.abs(d.reconciliationError)).toBeLessThanOrEqual(
      Math.max(1e-6, Math.abs(d.totalChange) * 1e-9)
    );
    expect(d.ordersContribution + d.aovContribution).toBeCloseTo(d.totalChange, 6);

    // The distinction Task 1 insists on.
    expect(d.interactionAllocatedByShapley).toBe(true);
    expect(d.interactionNote).toMatch(/allocated between Orders and AOV using Shapley/i);
  });

  it("emits no residual interaction driver", async () => {
    const contribs = await calculateDriverContributions("revenue", PERIOD, NORTH);
    expect(contribs.find((c) => c.driver === "interaction")).toBeUndefined();
  });

  it("agrees between calculateRevenueDecomposition and calculateDriverContributions", async () => {
    // The two used to implement different methodologies and disagree.
    const decomp = await calculateRevenueDecomposition("revenue", PERIOD, NORTH);
    const contribs = await calculateDriverContributions("revenue", PERIOD, NORTH);

    const orders = contribs.find((c) => c.driver === "orders")!;
    const aov = contribs.find((c) => c.driver === "aov")!;

    expect(orders.contribution).toBeCloseTo(decomp.ordersContribution, 6);
    expect(aov.contribution).toBeCloseTo(decomp.aovContribution, 6);
  });
});

describe("Test 2 - AOV Shapley reconciliation", () => {
  it("reconciles phi_revenue + phi_orders to the AOV change", async () => {
    const contribs = await calculateDriverContributions("aov", PERIOD, NORTH);
    const revenue = contribs.find((c) => c.driver === "revenue")!;
    const orders = contribs.find((c) => c.driver === "orders")!;

    expect(revenue.contributionType).toBe("exact");
    expect(orders.contributionType).toBe("exact");
    expect(revenue.reconciles).toBe(true);
    expect(Math.abs(revenue.reconciliationError!)).toBeLessThanOrEqual(1e-6);
  });

  it("exposes signed and magnitude shares as distinct quantities", async () => {
    const contribs = await calculateDriverContributions("aov", PERIOD, NORTH);
    const exact = contribs.filter((c) => c.contributionType === "exact");

    for (const c of exact) {
      expect(c.signedContributionPct).not.toBeNull();
      expect(c.magnitudeContributionPct).not.toBeNull();
      // Magnitude is always a genuine share.
      expect(c.magnitudeContributionPct!).toBeGreaterThanOrEqual(0);
      expect(c.magnitudeContributionPct!).toBeLessThanOrEqual(100);
    }

    const magSum = exact.reduce((s, c) => s + c.magnitudeContributionPct!, 0);
    expect(magSum).toBeCloseTo(100, 6);

    const signedSum = exact.reduce((s, c) => s + c.signedContributionPct!, 0);
    expect(signedSum).toBeCloseTo(100, 6);
  });

  it("does not use signed contribution as magnitude share", async () => {
    // In North Aug-2026 the two AOV factors offset, so signed shares fall far
    // outside [0,100] while magnitude shares stay inside it.
    const contribs = await calculateDriverContributions("aov", PERIOD, NORTH);
    const exact = contribs.filter((c) => c.contributionType === "exact");
    const anySignedOutOfRange = exact.some(
      (c) => c.signedContributionPct! < 0 || c.signedContributionPct! > 100
    );
    expect(anySignedOutOfRange).toBe(true);
    expect(exact.every((c) => c.magnitudeContributionPct! >= 0 && c.magnitudeContributionPct! <= 100)).toBe(true);
  });

  it("abstains rather than dividing by zero when orders is zero", () => {
    const shares = contributionShares([0, 0], 0);
    expect(shares[0].signedContributionPct).toBeNull();
    expect(shares[0].magnitudeContributionPct).toBeNull();
  });
});

describe("Test 3 - Dimension signed contribution", () => {
  it("is not clamped to [0,100]", async () => {
    // Constructed case: segments offsetting each other.
    const shares = contributionShares([120, -20], 100);
    expect(shares[0].signedContributionPct).toBeCloseTo(120, 10);
    expect(shares[1].signedContributionPct).toBeCloseTo(-20, 10);
  });

  it("computes signed share as change / totalChange on real data", async () => {
    const dims = await calculateDimensionContribution("revenue", PERIOD, "region");
    const total = dims.reduce((s, d) => s + d.change, 0);
    for (const d of dims) {
      expect(d.signedContributionPct).toBeCloseTo((d.change / total) * 100, 6);
    }
  });

  it("keeps signed and magnitude as separate fields", async () => {
    const dims = await calculateDimensionContribution("revenue", PERIOD, "region");
    for (const d of dims) {
      expect(d).toHaveProperty("signedContributionPct");
      expect(d).toHaveProperty("magnitudeContributionPct");
    }
  });
});

describe("Test 4 - Dimension magnitude contribution sums to 100%", () => {
  it.each([
    ["revenue", "region"],
    ["revenue", "product"],
    ["revenue", "channel"],
    ["conversion", "channel"],
    ["conversion", "campaign"],
    ["marketingROI", "channel"],
  ])("%s by %s sums to ~100%%", async (metric, dimension) => {
    const dims = await calculateDimensionContribution(metric, PERIOD, dimension as never);
    expect(dims.length).toBeGreaterThan(0);
    const magSum = dims.reduce((s, d) => s + (d.magnitudeContributionPct ?? 0), 0);
    expect(magSum).toBeCloseTo(100, 6);
    for (const d of dims) {
      expect(d.magnitudeContributionPct!).toBeGreaterThanOrEqual(0);
      expect(d.magnitudeContributionPct!).toBeLessThanOrEqual(100);
    }
  });

  it("magnitude share equals |change| / sum|change|", async () => {
    const dims = await calculateDimensionContribution("revenue", PERIOD, "product");
    const totalAbs = dims.reduce((s, d) => s + Math.abs(d.change), 0);
    for (const d of dims) {
      expect(d.magnitudeContributionPct).toBeCloseTo((Math.abs(d.change) / totalAbs) * 100, 6);
    }
  });
});

describe("Task 6 - Product mix Shapley decomposition", () => {
  it.each(["product", "category"] as const)(
    "reconciles phi_mix + phi_within to the AOV change at %s level",
    async (level) => {
      const m = await calculateProductMixDecomposition(PERIOD, NORTH, level);
      expect(m.insufficientData).toBeFalsy();
      expect(m.mixEffect + m.withinEffect).toBeCloseTo(m.totalChange, 6);
      expect(m.totalChange).toBeCloseTo(m.aovCurrent - m.aovPrevious, 6);
      expect(m.reconciles).toBe(true);
    }
  );

  it("holds per-item value fixed so mix reflects only share movement", async () => {
    const m = await calculateProductMixDecomposition(PERIOD, NORTH, "product");
    // Shares must form a distribution in each period.
    const s0 = m.items.reduce((s, i) => s + i.sharePrevious, 0);
    const s1 = m.items.reduce((s, i) => s + i.shareCurrent, 0);
    expect(s0).toBeCloseTo(1, 6);
    expect(s1).toBeCloseTo(1, 6);
  });

  it("reports mix and within magnitude shares summing to 100%", async () => {
    const m = await calculateProductMixDecomposition(PERIOD, NORTH, "product");
    expect(m.mixMagnitudeContributionPct! + m.withinMagnitudeContributionPct!).toBeCloseTo(100, 6);
  });
});
