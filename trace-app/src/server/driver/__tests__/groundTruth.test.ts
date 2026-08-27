/**
 * Test 20 - ground-truth scenario, plus the performance target (Task 19).
 *
 * The generator injects a controlled deterioration into North / 2026-08:
 *   Product B orders x0.4, Product A orders x0.7, others x0.9
 *   discounting 10-25% (vs 0-15% baseline)
 *   stockout rate 25-40% for B, 15-25% for A
 *   conversions x0.75 blended
 *
 * These assertions check that the engine RECOVERS that structure. They do not
 * demand an exact ranking, only that the mathematics supports the right story
 * and that no driver is silently zeroed.
 */

import { analyzeDrivers } from "../index";
import { generateHypotheses } from "../hypothesis";
import { getDriverHistory, getMonthsForPeriod } from "../history";
import { calculateProductMixDecomposition, calculateRevenueDecomposition } from "../contribution";
import { driverCache } from "../cache";

const PERIOD = "2026-08";
const NORTH = { region: "North" };

describe("Test 20 - ground truth: North, August 2026 revenue decline", () => {
  it("detects a material revenue decline concentrated in North", async () => {
    const all = await analyzeDrivers("revenue", PERIOD);
    expect(all.totalChange).toBeLessThan(0);

    const north = all.dimensions.find((d) => d.dimension === "region" && d.dimensionValue === "North")!;
    const others = all.dimensions.filter(
      (d) => d.dimension === "region" && d.dimensionValue !== "North"
    );

    // North must be the single largest contributor to the absolute movement.
    for (const o of others) {
      expect(north.magnitudeContributionPct!).toBeGreaterThan(o.magnitudeContributionPct!);
    }
  });

  it("recovers the underlying driver movements", async () => {
    const months = getMonthsForPeriod(PERIOD, 3);
    const read = async (d: string) => {
      const h = await getDriverHistory(d, months, NORTH);
      const prev = h.periods.find((p) => p.period === "2026-07")!;
      const curr = h.periods.find((p) => p.period === PERIOD)!;
      return { prev: prev.value, curr: curr.value };
    };

    const discount = await read("discount");
    const stockouts = await read("stockouts");
    const conversion = await read("conversion");
    const price = await read("price");
    const orders = await read("orders");
    const aov = await read("aov");

    expect(discount.curr).toBeGreaterThan(discount.prev);   // discounting increased
    expect(stockouts.curr).toBeGreaterThan(stockouts.prev); // stockouts increased
    expect(conversion.curr).toBeLessThan(conversion.prev);  // conversion decreased
    expect(orders.curr).toBeLessThan(orders.prev);          // orders decreased
    expect(aov.curr).toBeLessThan(aov.prev);                // AOV deteriorated

    // Gross unit price was NOT the mechanism -- discounting was.
    expect(Math.abs((price.curr - price.prev) / price.prev)).toBeLessThan(0.02);
  });

  it("attributes the revenue decline across Orders and AOV with exact reconciliation", async () => {
    const d = await calculateRevenueDecomposition("revenue", PERIOD, NORTH);
    expect(d.reconciles).toBe(true);
    expect(d.ordersContribution).toBeLessThan(0);
    expect(d.aovContribution).toBeLessThan(0);
    expect(d.ordersContribution + d.aovContribution).toBeCloseTo(d.totalChange, 6);
  });

  it("separates the AOV deterioration into mix and within-product effects", async () => {
    const m = await calculateProductMixDecomposition(PERIOD, NORTH, "product");
    expect(m.reconciles).toBe(true);
    expect(m.totalChange).toBeLessThan(0);
    // Both components are quantified rather than left descriptive.
    expect(Number.isFinite(m.mixEffect)).toBe(true);
    expect(Number.isFinite(m.withinEffect)).toBe(true);
    expect(m.mixEffect + m.withinEffect).toBeCloseTo(m.totalChange, 6);
  });

  it("surfaces stockouts and discounting as supported candidates", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, NORTH);
    const byDriver = new Map(hypotheses.map((h) => [h.driver, h]));

    const stockouts = byDriver.get("stockouts_revenue")!;
    const discount = byDriver.get("discount")!;

    for (const h of [stockouts, discount]) {
      expect(h.status).not.toBe("insufficient_data");
      expect(h.associationScore).not.toBeNull();
      expect(h.isStatisticallySignificant).toBe(true);
      expect(h.confidence).toBeGreaterThan(0.5);
    }

    // Both are negative drivers, so a decline in revenue should pair with a rise
    // in them: a negative correlation on the movement series.
    expect(stockouts.associationScore!).toBeLessThan(0);
    expect(discount.associationScore!).toBeLessThan(0);
  });

  it("ranks Orders, Stockouts, Discount and AOV above the non-movers", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, NORTH);
    const rank = new Map(hypotheses.map((h, i) => [h.driver, i]));

    const expectedTop = ["orders", "stockouts_revenue", "discount", "aov"];
    for (const driver of expectedTop) {
      expect(rank.get(driver)).toBeLessThan(rank.get("price")!);
      expect(rank.get(driver)).toBeLessThan(rank.get("refunds")!);
    }
  });

  it("does NOT report Association / Temporal / Segment as 0 for every driver", async () => {
    // This is the regression the whole exercise targets.
    const hypotheses = await generateHypotheses("revenue", PERIOD, NORTH);
    const supported = hypotheses.filter((h) => h.driver !== "refunds");

    expect(supported.some((h) => (h.associationScore ?? 0) !== 0)).toBe(true);
    expect(supported.some((h) => (h.temporalAlignment ?? 0) > 0)).toBe(true);
    expect(supported.some((h) => (h.segmentConsistency ?? 0) > 0)).toBe(true);

    for (const h of supported) {
      expect(h.associationScore).not.toBeNull();
      expect(h.sampleSize).toBeGreaterThan(0);
      expect(h.pValue).not.toBeNull();
    }
  });

  it("produces hypotheses for every metric, including conversion", async () => {
    for (const metric of ["revenue", "orders", "aov", "conversion", "marketingROI"]) {
      const hypotheses = await generateHypotheses(metric, PERIOD);
      // conversion previously returned zero hypotheses (Task 15).
      expect(hypotheses.length).toBeGreaterThan(0);
    }
  });
});

describe("Task 19 - performance", () => {
  it("serves a cold analysis well under 10s and a warm one under 3s", async () => {
    driverCache.clear();

    const coldStart = Date.now();
    await analyzeDrivers("revenue", PERIOD, NORTH);
    const cold = Date.now() - coldStart;

    const warmStart = Date.now();
    await analyzeDrivers("revenue", PERIOD, NORTH);
    const warm = Date.now() - warmStart;

    expect(cold).toBeLessThan(10_000);
    expect(warm).toBeLessThan(3_000);
  });

  it("Task 17 - shares one context between analyzeDrivers and generateHypotheses", async () => {
    driverCache.clear();
    await analyzeDrivers("revenue", PERIOD, NORTH);
    const afterAnalyze = driverCache.getStats();

    // Same scope: must be served from cache, adding no new entries.
    await generateHypotheses("revenue", PERIOD, NORTH);
    const afterHypotheses = driverCache.getStats();

    expect(afterHypotheses.size).toBe(afterAnalyze.size);
    expect(afterHypotheses.hits).toBeGreaterThan(afterAnalyze.hits);
  });

  it("Task 18 - cache is deterministic and invalidatable", async () => {
    driverCache.clear();
    const a = await analyzeDrivers("revenue", PERIOD, NORTH);
    const b = await analyzeDrivers("revenue", PERIOD, NORTH);
    expect(b.totalChange).toBe(a.totalChange);
    expect(b.drivers.map((h) => h.driver)).toEqual(a.drivers.map((h) => h.driver));

    driverCache.clear();
    expect(driverCache.getStats().size).toBe(0);

    const c = await analyzeDrivers("revenue", PERIOD, NORTH);
    expect(c.totalChange).toBe(a.totalChange); // deterministic after invalidation
  });
});
