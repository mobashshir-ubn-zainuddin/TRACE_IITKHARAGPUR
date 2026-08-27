/**
 * Driver history resolver (Tests 5-8, Task 4).
 *
 * Each formula is cross-checked against an independent raw SQL query, so the
 * test fails if the resolver and the documented formula ever diverge.
 */

import {
  getDriverHistory,
  getMonthsForPeriod,
  getSupportedDriverIds,
  isDriverHistorySupported,
  getDriverHistoryFormula,
  safeDiv,
  UNSUPPORTED_DRIVERS,
} from "../history";
import { getDB } from "../../db";
import { monthToDateRange } from "../../utils/dateUtils";

const PERIOD = "2026-08";
const MONTHS = getMonthsForPeriod(PERIOD, 12);
const NORTH = { region: "North" };

/** Independent raw-SQL ground truth for one month of North sales. */
async function northSalesRaw(period: string) {
  const db = await getDB();
  const { start, end } = monthToDateRange(period);
  return db.get(
    `SELECT COUNT(DISTINCT order_id) AS orders,
            SUM(net_revenue)   AS netRevenue,
            SUM(gross_revenue) AS grossRevenue,
            SUM(discount)      AS discount,
            SUM(quantity)      AS quantity
     FROM sales_transactions
     WHERE transaction_date BETWEEN ? AND ? AND region_id = 1`,
    start, end
  );
}

async function valueAt(driver: string, period: string, filters = NORTH) {
  const h = await getDriverHistory(driver, MONTHS, filters);
  return h.periods.find((p) => p.period === period)!;
}

describe("Test 5 - Price driver history", () => {
  it("equals SUM(gross_revenue) / SUM(quantity), not net revenue per unit", async () => {
    const raw = await northSalesRaw(PERIOD);
    const point = await valueAt("price", PERIOD);

    expect(point.hasData).toBe(true);
    expect(point.value).toBeCloseTo(raw.grossRevenue / raw.quantity, 6);

    // The old (incorrect) definition would double-count discounting as price.
    const netPerUnit = raw.netRevenue / raw.quantity;
    expect(point.value).not.toBeCloseTo(netPerUnit, 2);
    expect(point.value).toBeGreaterThan(netPerUnit);
  });

  it("documents the gross-price formula", () => {
    expect(getDriverHistoryFormula("price")).toBe("SUM(gross_revenue) / SUM(quantity)");
  });

  it("resolves a full 12-period series", async () => {
    const h = await getDriverHistory("price", MONTHS, NORTH);
    expect(h.sampleSize).toBe(MONTHS.length);
  });
});

describe("Test 6 - Discount driver history", () => {
  it("equals SUM(discount) / SUM(gross_revenue) * 100", async () => {
    const raw = await northSalesRaw(PERIOD);
    const point = await valueAt("discount", PERIOD);
    expect(point.value).toBeCloseTo((raw.discount / raw.grossRevenue) * 100, 6);
  });

  it("rises sharply in the ground-truth month", async () => {
    const prev = await valueAt("discount", "2026-07");
    const curr = await valueAt("discount", PERIOD);
    expect(curr.value).toBeGreaterThan(prev.value * 1.5);
  });
});

describe("Test 7 - Stockout driver history", () => {
  it("equals AVG(stockout_rate) * 100", async () => {
    const db = await getDB();
    const { start, end } = monthToDateRange(PERIOD);
    const raw = await db.get(
      `SELECT AVG(stockout_rate) AS r FROM operations_daily
       WHERE date BETWEEN ? AND ? AND region_id = 1`,
      start, end
    );
    const point = await valueAt("stockouts", PERIOD);
    expect(point.value).toBeCloseTo(raw.r * 100, 6);
  });

  it("is the exact complement of availability", async () => {
    const stockouts = await valueAt("stockouts", PERIOD);
    const availability = await valueAt("availability", PERIOD);
    expect(stockouts.value + availability.value).toBeCloseTo(100, 6);
  });

  it("rises in the ground-truth month", async () => {
    const prev = await valueAt("stockouts", "2026-07");
    const curr = await valueAt("stockouts", PERIOD);
    expect(curr.value).toBeGreaterThan(prev.value);
  });
});

describe("Test 8 - Conversion driver history", () => {
  it("equals SUM(conversions) / SUM(sessions) * 100", async () => {
    const db = await getDB();
    const { start, end } = monthToDateRange(PERIOD);
    const raw = await db.get(
      `SELECT SUM(conversions) AS c, SUM(sessions) AS s FROM marketing_daily
       WHERE date BETWEEN ? AND ? AND region_id = 1`,
      start, end
    );
    const point = await valueAt("conversion", PERIOD);
    expect(point.value).toBeCloseTo((raw.c / raw.s) * 100, 6);
  });

  it("declines in the ground-truth month", async () => {
    const prev = await valueAt("conversion", "2026-07");
    const curr = await valueAt("conversion", PERIOD);
    expect(curr.value).toBeLessThan(prev.value);
  });

  it("resolves traffic as SUM(sessions)", async () => {
    const db = await getDB();
    const { start, end } = monthToDateRange(PERIOD);
    const raw = await db.get(
      `SELECT SUM(sessions) AS s FROM marketing_daily
       WHERE date BETWEEN ? AND ? AND region_id = 1`,
      start, end
    );
    const point = await valueAt("traffic", PERIOD);
    expect(point.value).toBeCloseTo(raw.s, 6);
  });
});

describe("Task 4 - resolver coverage and numerical safety", () => {
  it("resolves every supported driver without NaN or Infinity", async () => {
    for (const driver of getSupportedDriverIds()) {
      const h = await getDriverHistory(driver, MONTHS, NORTH);
      expect(h.unsupported).toBeFalsy();
      for (const p of h.periods) {
        expect(Number.isFinite(p.value)).toBe(true);
        expect(Number.isNaN(p.value)).toBe(false);
      }
      expect(h.sampleSize).toBeGreaterThan(0);
    }
  });

  it("covers marketing, operations and sales drivers, not only KPI metrics", () => {
    for (const d of ["price", "discount", "stockouts", "availability", "traffic", "marketing_spend", "attributed_revenue"]) {
      expect(isDriverHistorySupported(d)).toBe(true);
    }
  });

  it("reports genuinely unsupported drivers instead of inventing data", async () => {
    expect(isDriverHistorySupported("refunds")).toBe(false);
    expect(UNSUPPORTED_DRIVERS.refunds).toMatch(/no refund column/i);

    const h = await getDriverHistory("refunds", MONTHS, NORTH);
    expect(h.unsupported).toBe(true);
    expect(h.sampleSize).toBe(0);
  });

  it("safeDiv never returns NaN or Infinity", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(0, 0)).toBeNull();
    expect(safeDiv(NaN, 1)).toBeNull();
    expect(safeDiv(1, Infinity)).toBeNull();
    expect(safeDiv(10, 4)).toBe(2.5);
  });

  it("marks zero-denominator periods as hasData=false with value 0", async () => {
    // A region/product scope with no marketing rows in some months.
    const h = await getDriverHistory("conversion", MONTHS, { region: "North", product: "Product A" });
    for (const p of h.periods) {
      expect(Number.isFinite(p.value)).toBe(true);
      if (!p.hasData) expect(p.value).toBe(0);
    }
  });
});
