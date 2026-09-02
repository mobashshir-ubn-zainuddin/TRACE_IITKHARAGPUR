/**
 * Root-cause regression tests for the "dashboard resolves an empty future
 * period" bug: the app must resolve its current analysis period from the
 * actual data (latest month with rows), never from the system clock, and
 * must never materialize a missing period as a genuine zero.
 */
import { getDB } from "../../db";
import {
  getLatestAvailablePeriod,
  periodHasData,
  computeKPI,
  getKPIHistoryBatched,
} from "../index";
import { generateSignal } from "../../signal";
import { prevMonth, monthToDateRange } from "../../utils/dateUtils";

// A month guaranteed to have zero rows in the seeded/uploaded dataset.
const FAR_FUTURE_PERIOD = "2099-01";

describe("data-aware period resolution", () => {
  test("getLatestAvailablePeriod matches the actual MAX(transaction_date) in the data, not the system clock", async () => {
    const db = await getDB();
    const row = await db.get(
      `SELECT MAX(strftime('%Y-%m', transaction_date)) as period FROM sales_transactions`
    );
    const expected = row?.period ?? null;

    const resolved = await getLatestAvailablePeriod("revenue");
    expect(resolved).toBe(expected);

    // The whole point of the fix: this must not just happen to equal
    // today's calendar month - it must be independent of it. Assert the
    // resolution path never reads `new Date()` by cross-checking against a
    // raw SQL MAX() computed with no calendar involvement at all (above).
    expect(resolved).not.toBeNull();
  });

  test("previous period is one calendar month before the resolved latest period", async () => {
    const latest = await getLatestAvailablePeriod("revenue");
    expect(latest).not.toBeNull();
    const previous = prevMonth(latest!);
    const [ly, lm] = latest!.split("-").map(Number);
    const [py, pm] = previous.split("-").map(Number);
    if (lm === 1) {
      expect(pm).toBe(12);
      expect(py).toBe(ly - 1);
    } else {
      expect(pm).toBe(lm - 1);
      expect(py).toBe(ly);
    }
  });

  test("a calendar month with no rows is omitted from KPI history, not materialized as zero", async () => {
    const latest = await getLatestAvailablePeriod("revenue");
    expect(latest).not.toBeNull();

    const history = await getKPIHistoryBatched("revenue", [latest!, FAR_FUTURE_PERIOD]);
    const periods = history.map((h) => h.period);

    expect(periods).toContain(latest);
    expect(periods).not.toContain(FAR_FUTURE_PERIOD);
  });

  test("periodHasData is false for a period with zero rows, true for the latest real period", async () => {
    const latest = await getLatestAvailablePeriod("revenue");
    expect(latest).not.toBeNull();

    await expect(periodHasData("revenue", FAR_FUTURE_PERIOD)).resolves.toBe(false);
    await expect(periodHasData("revenue", latest!)).resolves.toBe(true);
  });

  test("computeKPI flags dataAvailable: false for a period with no rows, instead of silently reporting 0", async () => {
    const kpi = await computeKPI("revenue", FAR_FUTURE_PERIOD);
    expect(kpi.dataAvailable).toBe(false);
    expect(kpi.value).toBe(0);
    // A missing period must not be flagged as an anomaly either - there is
    // nothing to detect an anomaly in.
    expect(kpi.is_anomaly).toBe(false);
  });

  test("computeKPI flags dataAvailable: true for a period that genuinely has rows (even if their sum happens to be zero)", async () => {
    // Insert one synthetic fully-discounted transaction (net_revenue = 0)
    // into an otherwise-empty test month, to prove "rows exist but sum to
    // zero" is reported as real data, not confused with "no rows at all".
    const db = await getDB();
    const testMonth = "2030-06";
    const region = await db.get("SELECT id FROM regions LIMIT 1");
    const product = await db.get("SELECT id FROM products LIMIT 1");
    const { start } = monthToDateRange(testMonth);

    const insert = await db.run(
      `INSERT INTO sales_transactions
        (order_id, transaction_date, region_id, product_id, channel, quantity, gross_revenue, discount, net_revenue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "TEST-ZERO-REVENUE-ROW",
      start,
      region.id,
      product.id,
      "Online",
      1,
      1000,
      1000,
      0
    );

    try {
      const kpi = await computeKPI("revenue", testMonth);
      expect(kpi.dataAvailable).toBe(true);
      expect(kpi.value).toBe(0);

      const hasData = await periodHasData("revenue", testMonth);
      expect(hasData).toBe(true);

      // And this genuine zero must still show up in history (unlike a
      // truly-missing month), because a real row exists for it.
      const history = await getKPIHistoryBatched("revenue", [testMonth]);
      expect(history).toEqual([{ period: testMonth, value: 0 }]);
    } finally {
      await db.run("DELETE FROM sales_transactions WHERE id = ?", insert.lastID);
    }
  });

  test("generateSignal never fabricates a -100% movement for a period with no data", async () => {
    const signal = await generateSignal("revenue", FAR_FUTURE_PERIOD);
    expect(signal.changePct).toBe(0);
    expect(signal.dataAvailable).toBe(false);
    expect(signal.reasonCodes).toContain("NO_DATA_FOR_PERIOD");
    // Must not be reported as a critical/urgent movement.
    expect(signal.status).not.toBe("urgent");
    expect(signal.priority).not.toBe("critical");
  }, 30000);

  test("generateSignal for the resolved latest period reports a real MoM change against the real previous month", async () => {
    const latest = await getLatestAvailablePeriod("revenue");
    expect(latest).not.toBeNull();

    const signal = await generateSignal("revenue", latest!);
    const kpi = await computeKPI("revenue", latest!);

    expect(signal.dataAvailable).not.toBe(false);
    expect(signal.currentValue).toBe(kpi.value);
    expect(signal.previousValue).toBe(kpi.previousValue);
    // Sanity: a real resolved period must not silently be a 0/0 no-op.
    expect(signal.currentValue).toBeGreaterThan(0);
  }, 30000);

  test("driver analysis and the KPI signal agree on the same resolved period's numbers", async () => {
    const { analyzeDrivers } = await import("../../driver");
    const latest = await getLatestAvailablePeriod("revenue");
    expect(latest).not.toBeNull();

    const kpi = await computeKPI("revenue", latest!);
    const driverResult = await analyzeDrivers("revenue", latest!);

    expect(driverResult.period).toBe(latest);
    // Both are computed from the same [prevMonth(latest), latest] window via
    // the same monthToDateRange/prevMonth helpers, so their overall change
    // percentages must match (within rounding).
    expect(Math.abs(driverResult.totalChangePct - kpi.changePct)).toBeLessThan(0.5);
  }, 30000);
});
