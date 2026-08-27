/**
 * Driver history resolver (Module 3, Task 4).
 *
 * Why this exists
 * ---------------
 * The association / temporal / segmentation engines previously called
 * `getKPIHistoryBatched(driverId)`, which only understands the five *KPI*
 * metrics (revenue, orders, aov, conversion, marketingROI). Every other driver
 * -- price, discount, stockouts, traffic, marketing spend, ... -- threw, was
 * swallowed by a catch, and silently degraded to `pearsonR = 0`, which is why
 * the dashboard showed Association 0.00 / Temporal 0% / Segment 0% for drivers
 * that genuinely move.
 *
 * This module resolves a deterministic, SQL-backed monthly series for *every*
 * supported driver.
 *
 * Performance design
 * ------------------
 * Rather than one query per driver, every driver is derived from one of a small
 * number of *batched aggregate* queries:
 *
 *   sales_transactions -> SUM(gross_revenue), SUM(net_revenue), SUM(discount),
 *                         SUM(quantity), COUNT(DISTINCT order_id)
 *   marketing_daily    -> SUM(sessions), SUM(conversions), SUM(marketing_spend),
 *                         SUM(attributed_revenue)
 *   operations_daily   -> AVG(stockout_rate)
 *
 * Each is a single GROUP BY over the whole requested window, memoized in the
 * driver cache. So resolving all ~20 drivers costs 3 queries, not 20+.
 *
 * Numerical safety
 * ----------------
 * Every ratio goes through `safeDiv`, which returns `null` on a zero/invalid
 * denominator. A period with no usable value is reported as `value: 0` with
 * `hasData: false`, and is excluded from `sampleSize`. No code path can emit
 * NaN or Infinity.
 */

import { getDB } from "../db";
import { resolveRegionId, resolveProductId } from "../kpi";
import { monthToDateRange } from "../utils/dateUtils";
import { driverCache, makeHistoryCacheKey } from "./cache";
import { getDriverDefinition } from "./definitions";

export interface DriverHistoryPeriod {
  period: string;
  value: number;
  /** False when the period had no source rows, or a zero denominator. */
  hasData: boolean;
}

export interface DriverHistory {
  driver: string;
  periods: DriverHistoryPeriod[];
  /** Number of periods that produced a genuine value. */
  sampleSize: number;
  /** True when this driver has no SQL-backed resolver at all. */
  unsupported?: boolean;
  /** Human-readable formula actually executed. */
  formula?: string;
}

export interface DriverFilters {
  region?: string;
  product?: string;
  channel?: string;
  campaign?: string;
}

/** Division that can never produce NaN, Infinity, or -Infinity. */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------------------
// Batched aggregate fetchers
// ---------------------------------------------------------------------------

interface SalesAgg {
  orders: number;
  netRevenue: number;
  grossRevenue: number;
  discount: number;
  quantity: number;
}

interface MarketingAgg {
  sessions: number;
  conversions: number;
  spend: number;
  attributedRevenue: number;
}

interface OpsAgg {
  stockoutRate: number;
  inventoryAvailable: number;
}

/** Bounding date range covering every requested month. */
function windowRange(months: string[]): { start: string; end: string } {
  const sorted = [...months].sort();
  const { start } = monthToDateRange(sorted[0]);
  const { end } = monthToDateRange(sorted[sorted.length - 1]);
  return { start, end };
}

async function resolveFilterIds(filters?: DriverFilters) {
  const regionId = filters?.region ? await resolveRegionId(filters.region) : undefined;
  const productId = filters?.product ? await resolveProductId(filters.product) : undefined;
  return { regionId, productId };
}

async function getSalesAggregates(months: string[], filters?: DriverFilters): Promise<Map<string, SalesAgg>> {
  if (months.length === 0) return new Map();
  const key = makeHistoryCacheKey("__agg_sales", months, filters);
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = windowRange(months);
    const { regionId, productId } = await resolveFilterIds(filters);

    let where = "WHERE transaction_date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND product_id = ?"; params.push(productId); }
    if (filters?.channel) { where += " AND channel = ?"; params.push(filters.channel); }

    const rows = await db.all(
      `SELECT strftime('%Y-%m', transaction_date) AS period,
              COUNT(DISTINCT order_id)          AS orders,
              COALESCE(SUM(net_revenue), 0)     AS netRevenue,
              COALESCE(SUM(gross_revenue), 0)   AS grossRevenue,
              COALESCE(SUM(discount), 0)        AS discount,
              COALESCE(SUM(quantity), 0)        AS quantity
       FROM sales_transactions
       ${where}
       GROUP BY period`,
      ...params
    );

    const map = new Map<string, SalesAgg>();
    for (const r of rows) {
      map.set(r.period, {
        orders: r.orders || 0,
        netRevenue: r.netRevenue || 0,
        grossRevenue: r.grossRevenue || 0,
        discount: r.discount || 0,
        quantity: r.quantity || 0,
      });
    }
    return map;
  });
}

async function getMarketingAggregates(months: string[], filters?: DriverFilters): Promise<Map<string, MarketingAgg>> {
  if (months.length === 0) return new Map();
  const key = makeHistoryCacheKey("__agg_marketing", months, filters);
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = windowRange(months);
    const { regionId, productId } = await resolveFilterIds(filters);

    let where = "WHERE date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND product_id = ?"; params.push(productId); }
    if (filters?.channel) { where += " AND channel = ?"; params.push(filters.channel); }
    if (filters?.campaign) { where += " AND campaign = ?"; params.push(filters.campaign); }

    const rows = await db.all(
      `SELECT strftime('%Y-%m', date) AS period,
              COALESCE(SUM(sessions), 0)           AS sessions,
              COALESCE(SUM(conversions), 0)        AS conversions,
              COALESCE(SUM(marketing_spend), 0)    AS spend,
              COALESCE(SUM(attributed_revenue), 0) AS attributedRevenue
       FROM marketing_daily
       ${where}
       GROUP BY period`,
      ...params
    );

    const map = new Map<string, MarketingAgg>();
    for (const r of rows) {
      map.set(r.period, {
        sessions: r.sessions || 0,
        conversions: r.conversions || 0,
        spend: r.spend || 0,
        attributedRevenue: r.attributedRevenue || 0,
      });
    }
    return map;
  });
}

async function getOpsAggregates(months: string[], filters?: DriverFilters): Promise<Map<string, OpsAgg>> {
  if (months.length === 0) return new Map();
  // operations_daily has no channel/campaign grain; those filters cannot be honoured here.
  const opsFilters: DriverFilters = { region: filters?.region, product: filters?.product };
  const key = makeHistoryCacheKey("__agg_ops", months, opsFilters);
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = windowRange(months);
    const { regionId, productId } = await resolveFilterIds(opsFilters);

    let where = "WHERE date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND product_id = ?"; params.push(productId); }

    const rows = await db.all(
      `SELECT strftime('%Y-%m', date) AS period,
              AVG(stockout_rate)          AS stockoutRate,
              AVG(inventory_available)    AS inventoryAvailable
       FROM operations_daily
       ${where}
       GROUP BY period`,
      ...params
    );

    const map = new Map<string, OpsAgg>();
    for (const r of rows) {
      map.set(r.period, {
        stockoutRate: Number.isFinite(r.stockoutRate) ? r.stockoutRate : 0,
        inventoryAvailable: Number.isFinite(r.inventoryAvailable) ? r.inventoryAvailable : 0,
      });
    }
    return map;
  });
}

/** Granularity for the product-mix decomposition. `products.category` exists, so both work. */
export type MixLevel = "product" | "category";

/**
 * Per-period, per-item order counts and revenue. Backs both the product-mix
 * index and the exact Shapley mix decomposition (Task 6).
 */
export async function getSalesProductAggregates(
  months: string[],
  filters?: DriverFilters,
  level: MixLevel = "product"
): Promise<Map<string, Map<string, { orders: number; revenue: number }>>> {
  if (months.length === 0) return new Map();
  const key = makeHistoryCacheKey(`__agg_sales_${level}`, months, filters);
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = windowRange(months);
    const { regionId, productId } = await resolveFilterIds(filters);

    let where = "WHERE st.transaction_date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND st.region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND st.product_id = ?"; params.push(productId); }
    if (filters?.channel) { where += " AND st.channel = ?"; params.push(filters.channel); }

    // COALESCE guards products with a NULL category so they form their own bucket
    // rather than silently collapsing together.
    const itemCol = level === "category" ? "COALESCE(p.category, 'Uncategorised')" : "p.name";

    const rows = await db.all(
      `SELECT strftime('%Y-%m', st.transaction_date) AS period,
              ${itemCol}                    AS item,
              COUNT(DISTINCT st.order_id)   AS orders,
              COALESCE(SUM(st.net_revenue), 0) AS revenue
       FROM sales_transactions st
       JOIN products p ON st.product_id = p.id
       ${where}
       GROUP BY period, ${itemCol}`,
      ...params
    );

    const map = new Map<string, Map<string, { orders: number; revenue: number }>>();
    for (const r of rows) {
      if (!map.has(r.period)) map.set(r.period, new Map());
      map.get(r.period)!.set(r.item, { orders: r.orders || 0, revenue: r.revenue || 0 });
    }
    return map;
  });
}

/** Per-period, per-channel sessions and conversions. Backs the channel-mix index. */
export async function getMarketingChannelAggregates(
  months: string[],
  filters?: DriverFilters
): Promise<Map<string, Map<string, { sessions: number; conversions: number }>>> {
  if (months.length === 0) return new Map();
  const key = makeHistoryCacheKey("__agg_marketing_channel", months, filters);
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = windowRange(months);
    const { regionId, productId } = await resolveFilterIds(filters);

    let where = "WHERE date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND product_id = ?"; params.push(productId); }
    if (filters?.campaign) { where += " AND campaign = ?"; params.push(filters.campaign); }

    const rows = await db.all(
      `SELECT strftime('%Y-%m', date) AS period,
              channel                       AS channel,
              COALESCE(SUM(sessions), 0)    AS sessions,
              COALESCE(SUM(conversions), 0) AS conversions
       FROM marketing_daily
       ${where}
       GROUP BY period, channel`,
      ...params
    );

    const map = new Map<string, Map<string, { sessions: number; conversions: number }>>();
    for (const r of rows) {
      if (!map.has(r.period)) map.set(r.period, new Map());
      map.get(r.period)!.set(r.channel, { sessions: r.sessions || 0, conversions: r.conversions || 0 });
    }
    return map;
  });
}

// ---------------------------------------------------------------------------
// Driver -> series specification
// ---------------------------------------------------------------------------

type Source = "sales" | "marketing" | "ops" | "salesMix" | "marketingMix";

interface DriverSpec {
  source: Source;
  formula: string;
  /** Derive the scalar for one period. Return null when undefined/zero-denominator. */
  sales?: (a: SalesAgg) => number | null;
  marketing?: (a: MarketingAgg) => number | null;
  ops?: (a: OpsAgg) => number | null;
}

/**
 * Every SQL-backed driver series.
 *
 * KPI ids (revenue/orders/aov/conversion/marketingROI) are included because the
 * decomposition engines treat them as drivers of one another (e.g. Revenue and
 * Orders are the two Shapley factors of AOV).
 */
const DRIVER_SPECS: Record<string, DriverSpec> = {
  // --- sales_transactions -------------------------------------------------
  revenue: {
    source: "sales",
    formula: "SUM(net_revenue)",
    sales: (a) => a.netRevenue,
  },
  orders: {
    source: "sales",
    formula: "COUNT(DISTINCT order_id)",
    sales: (a) => a.orders,
  },
  aov: {
    source: "sales",
    formula: "SUM(net_revenue) / COUNT(DISTINCT order_id)",
    sales: (a) => safeDiv(a.netRevenue, a.orders),
  },
  price: {
    source: "sales",
    formula: "SUM(gross_revenue) / SUM(quantity)",
    sales: (a) => safeDiv(a.grossRevenue, a.quantity),
  },
  discount: {
    source: "sales",
    formula: "SUM(discount) / SUM(gross_revenue) * 100",
    sales: (a) => {
      const r = safeDiv(a.discount, a.grossRevenue);
      return r === null ? null : r * 100;
    },
  },
  discounting_aov: {
    source: "sales",
    formula: "SUM(discount) / SUM(gross_revenue) * 100",
    sales: (a) => {
      const r = safeDiv(a.discount, a.grossRevenue);
      return r === null ? null : r * 100;
    },
  },

  // --- operations_daily ---------------------------------------------------
  availability: {
    source: "ops",
    formula: "AVG(1 - stockout_rate) * 100",
    ops: (a) => (1 - a.stockoutRate) * 100,
  },
  stockouts: {
    source: "ops",
    formula: "AVG(stockout_rate) * 100",
    ops: (a) => a.stockoutRate * 100,
  },
  stockouts_revenue: {
    source: "ops",
    formula: "AVG(stockout_rate) * 100",
    ops: (a) => a.stockoutRate * 100,
  },
  product_availability_aov: {
    source: "ops",
    formula: "AVG(stockout_rate) * 100",
    ops: (a) => a.stockoutRate * 100,
  },

  // --- marketing_daily ----------------------------------------------------
  conversion: {
    source: "marketing",
    formula: "SUM(conversions) / SUM(sessions) * 100",
    marketing: (a) => {
      const r = safeDiv(a.conversions, a.sessions);
      return r === null ? null : r * 100;
    },
  },
  traffic: {
    source: "marketing",
    formula: "SUM(sessions)",
    marketing: (a) => a.sessions,
  },
  sessions: {
    source: "marketing",
    formula: "SUM(sessions)",
    marketing: (a) => a.sessions,
  },
  conversion_traffic: {
    source: "marketing",
    formula: "SUM(sessions)",
    marketing: (a) => a.sessions,
  },
  marketing: {
    source: "marketing",
    formula: "SUM(attributed_revenue) / SUM(marketing_spend)",
    marketing: (a) => safeDiv(a.attributedRevenue, a.spend),
  },
  marketingROI: {
    source: "marketing",
    formula: "SUM(attributed_revenue) / SUM(marketing_spend)",
    marketing: (a) => safeDiv(a.attributedRevenue, a.spend),
  },
  marketing_campaign: {
    source: "marketing",
    formula: "SUM(attributed_revenue) / SUM(marketing_spend)",
    marketing: (a) => safeDiv(a.attributedRevenue, a.spend),
  },
  conversion_campaign_effectiveness: {
    source: "marketing",
    formula: "SUM(attributed_revenue) / SUM(marketing_spend)",
    marketing: (a) => safeDiv(a.attributedRevenue, a.spend),
  },
  marketing_spend: {
    source: "marketing",
    formula: "SUM(marketing_spend)",
    marketing: (a) => a.spend,
  },
  attributed_revenue: {
    source: "marketing",
    formula: "SUM(attributed_revenue)",
    marketing: (a) => a.attributedRevenue,
  },

  // --- composition indices ------------------------------------------------
  productMix: {
    source: "salesMix",
    formula: "Mix index: SUM_i(s_i,t * p_i,ref), s_i = Orders_i/TotalOrders, p_i,ref = window mean revenue-per-order",
  },
  conversion_channel_mix: {
    source: "marketingMix",
    formula: "Mix index: SUM_c(share_c,t * cr_c,ref), share_c = Sessions_c/TotalSessions",
  },
};

/**
 * Drivers with no SQL-backed series, and why.
 * `refunds` is declared in definitions.ts but sales_transactions has no refund
 * column, and the spec forbids inventing data.
 */
export const UNSUPPORTED_DRIVERS: Record<string, string> = {
  refunds: "sales_transactions has no refund column; a refund rate cannot be computed without inventing data.",
};

export function isDriverHistorySupported(driverId: string): boolean {
  return driverId in DRIVER_SPECS;
}

export function getDriverHistoryFormula(driverId: string): string | undefined {
  return DRIVER_SPECS[driverId]?.formula;
}

export function getSupportedDriverIds(): string[] {
  return Object.keys(DRIVER_SPECS);
}

// ---------------------------------------------------------------------------
// Mix indices
// ---------------------------------------------------------------------------

/**
 * A Laspeyres-style mix index. Holding per-item value at a fixed window-wide
 * reference, the index moves only when the *share* mix moves -- isolating
 * composition shift from within-item price/rate movement.
 */
function buildMixIndex(
  months: string[],
  perPeriod: Map<string, Map<string, { weight: number; valueNum: number; valueDen: number }>>
): DriverHistoryPeriod[] {
  // Reference per-item value across the whole window.
  const refNum = new Map<string, number>();
  const refDen = new Map<string, number>();
  for (const items of perPeriod.values()) {
    for (const [item, v] of items) {
      refNum.set(item, (refNum.get(item) ?? 0) + v.valueNum);
      refDen.set(item, (refDen.get(item) ?? 0) + v.valueDen);
    }
  }
  const refValue = new Map<string, number>();
  for (const item of refNum.keys()) {
    const v = safeDiv(refNum.get(item) ?? 0, refDen.get(item) ?? 0);
    if (v !== null) refValue.set(item, v);
  }

  return months.map((period) => {
    const items = perPeriod.get(period);
    if (!items || items.size === 0) return { period, value: 0, hasData: false };

    const totalWeight = [...items.values()].reduce((s, v) => s + v.weight, 0);
    if (totalWeight <= 0) return { period, value: 0, hasData: false };

    let index = 0;
    let covered = 0;
    for (const [item, v] of items) {
      const ref = refValue.get(item);
      if (ref === undefined) continue;
      const share = v.weight / totalWeight;
      index += share * ref;
      covered += share;
    }
    if (covered <= 0) return { period, value: 0, hasData: false };
    return { period, value: index, hasData: true };
  });
}

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a deterministic monthly series for `driverId`.
 *
 * @param driverId one of `getSupportedDriverIds()`
 * @param months   explicit list of `YYYY-MM` periods, oldest first
 * @param filters  optional region / product / channel / campaign scope
 */
export async function getDriverHistory(
  driverId: string,
  months: string[],
  filters?: DriverFilters
): Promise<DriverHistory> {
  const spec = DRIVER_SPECS[driverId];
  const definition = getDriverDefinition(driverId);

  if (!spec) {
    return {
      driver: driverId,
      periods: months.map((period) => ({ period, value: 0, hasData: false })),
      sampleSize: 0,
      unsupported: true,
      formula: UNSUPPORTED_DRIVERS[driverId],
    };
  }

  const key = makeHistoryCacheKey(driverId, months, filters);
  return driverCache.getOrCompute(key, async (): Promise<DriverHistory> => {
    let periods: DriverHistoryPeriod[];

    if (spec.source === "sales") {
      const agg = await getSalesAggregates(months, filters);
      periods = months.map((period) => {
        const a = agg.get(period);
        if (!a) return { period, value: 0, hasData: false };
        const v = spec.sales!(a);
        return v === null || !Number.isFinite(v)
          ? { period, value: 0, hasData: false }
          : { period, value: v, hasData: true };
      });
    } else if (spec.source === "marketing") {
      const agg = await getMarketingAggregates(months, filters);
      periods = months.map((period) => {
        const a = agg.get(period);
        if (!a) return { period, value: 0, hasData: false };
        const v = spec.marketing!(a);
        return v === null || !Number.isFinite(v)
          ? { period, value: 0, hasData: false }
          : { period, value: v, hasData: true };
      });
    } else if (spec.source === "ops") {
      const agg = await getOpsAggregates(months, filters);
      periods = months.map((period) => {
        const a = agg.get(period);
        if (!a) return { period, value: 0, hasData: false };
        const v = spec.ops!(a);
        return v === null || !Number.isFinite(v)
          ? { period, value: 0, hasData: false }
          : { period, value: v, hasData: true };
      });
    } else if (spec.source === "salesMix") {
      const agg = await getSalesProductAggregates(months, filters);
      const shaped = new Map<string, Map<string, { weight: number; valueNum: number; valueDen: number }>>();
      for (const [period, items] of agg) {
        const m = new Map<string, { weight: number; valueNum: number; valueDen: number }>();
        for (const [product, v] of items) {
          m.set(product, { weight: v.orders, valueNum: v.revenue, valueDen: v.orders });
        }
        shaped.set(period, m);
      }
      periods = buildMixIndex(months, shaped);
    } else {
      const agg = await getMarketingChannelAggregates(months, filters);
      const shaped = new Map<string, Map<string, { weight: number; valueNum: number; valueDen: number }>>();
      for (const [period, items] of agg) {
        const m = new Map<string, { weight: number; valueNum: number; valueDen: number }>();
        for (const [channel, v] of items) {
          // conversion rate per channel, in percent
          m.set(channel, { weight: v.sessions, valueNum: v.conversions * 100, valueDen: v.sessions });
        }
        shaped.set(period, m);
      }
      periods = buildMixIndex(months, shaped);
    }

    return {
      driver: driverId,
      periods,
      sampleSize: periods.filter((p) => p.hasData).length,
      formula: spec.formula ?? definition?.calculation,
    };
  });
}

// ---------------------------------------------------------------------------
// Dimension breakdown (backs segment consistency, Task 10)
// ---------------------------------------------------------------------------

export type BreakdownDimension = "region" | "product" | "channel" | "campaign";

export interface DriverBreakdownRow {
  dimensionValue: string;
  value: number;
  hasData: boolean;
}

/** Which dimensions each source table can actually group by. */
const SOURCE_DIMENSIONS: Record<Source, BreakdownDimension[]> = {
  sales: ["region", "product", "channel"],
  salesMix: ["region", "product", "channel"],
  marketing: ["region", "product", "channel", "campaign"],
  marketingMix: ["region", "product", "channel", "campaign"],
  ops: ["region", "product"],
};

export function driverSupportsDimension(driverId: string, dimension: BreakdownDimension): boolean {
  const spec = DRIVER_SPECS[driverId];
  if (!spec) return false;
  return SOURCE_DIMENSIONS[spec.source].includes(dimension);
}

/**
 * Per-segment value of a driver for a single period.
 * Returns `[]` when the driver/dimension pair is unsupported, so callers can
 * distinguish "cannot measure" from "measured and inconsistent".
 */
export async function getDriverBreakdown(
  driverId: string,
  period: string,
  dimension: BreakdownDimension,
  filters?: DriverFilters
): Promise<DriverBreakdownRow[]> {
  const spec = DRIVER_SPECS[driverId];
  if (!spec) return [];
  if (!driverSupportsDimension(driverId, dimension)) return [];

  const key = `breakdown|${driverId}|${period}|${dimension}|${filters?.region ?? ""}|${filters?.product ?? ""}|${filters?.channel ?? ""}|${filters?.campaign ?? ""}`;
  return driverCache.getOrCompute(key, async () => {
    const db = await getDB();
    const { start, end } = monthToDateRange(period);
    const { regionId, productId } = await resolveFilterIds(filters);

    const isSales = spec.source === "sales" || spec.source === "salesMix";
    const isOps = spec.source === "ops";

    if (isOps) {
      const dimCol = dimension === "region" ? "r.name" : "p.name";
      const join = dimension === "region"
        ? "JOIN regions r ON o.region_id = r.id"
        : "JOIN products p ON o.product_id = p.id";
      let where = "WHERE o.date BETWEEN ? AND ?";
      const params: (string | number)[] = [start, end];
      if (regionId !== undefined) { where += " AND o.region_id = ?"; params.push(regionId); }
      if (productId !== undefined) { where += " AND o.product_id = ?"; params.push(productId); }

      const rows = await db.all(
        `SELECT ${dimCol} AS dv, AVG(o.stockout_rate) AS stockoutRate, AVG(o.inventory_available) AS inventoryAvailable
         FROM operations_daily o ${join} ${where} GROUP BY ${dimCol}`,
        ...params
      );
      return rows.map((r) => {
        const v = spec.ops!({
          stockoutRate: Number.isFinite(r.stockoutRate) ? r.stockoutRate : 0,
          inventoryAvailable: Number.isFinite(r.inventoryAvailable) ? r.inventoryAvailable : 0,
        });
        return {
          dimensionValue: r.dv,
          value: v === null || !Number.isFinite(v) ? 0 : v,
          hasData: v !== null && Number.isFinite(v),
        };
      });
    }

    if (isSales) {
      const dimCol = dimension === "region" ? "r.name" : dimension === "product" ? "p.name" : "st.channel";
      let join = "";
      if (dimension === "region") join = "JOIN regions r ON st.region_id = r.id";
      else if (dimension === "product") join = "JOIN products p ON st.product_id = p.id";

      let where = "WHERE st.transaction_date BETWEEN ? AND ?";
      const params: (string | number)[] = [start, end];
      if (regionId !== undefined) { where += " AND st.region_id = ?"; params.push(regionId); }
      if (productId !== undefined) { where += " AND st.product_id = ?"; params.push(productId); }
      if (filters?.channel) { where += " AND st.channel = ?"; params.push(filters.channel); }

      const rows = await db.all(
        `SELECT ${dimCol} AS dv,
                COUNT(DISTINCT st.order_id)        AS orders,
                COALESCE(SUM(st.net_revenue), 0)   AS netRevenue,
                COALESCE(SUM(st.gross_revenue), 0) AS grossRevenue,
                COALESCE(SUM(st.discount), 0)      AS discount,
                COALESCE(SUM(st.quantity), 0)      AS quantity
         FROM sales_transactions st ${join} ${where} GROUP BY ${dimCol}`,
        ...params
      );
      // salesMix has no per-segment scalar of its own; fall back to AOV, which is
      // what the mix index is a component of.
      const fn = spec.sales ?? ((a: SalesAgg) => safeDiv(a.netRevenue, a.orders));
      return rows.map((r) => {
        const v = fn({
          orders: r.orders || 0,
          netRevenue: r.netRevenue || 0,
          grossRevenue: r.grossRevenue || 0,
          discount: r.discount || 0,
          quantity: r.quantity || 0,
        });
        return {
          dimensionValue: r.dv,
          value: v === null || !Number.isFinite(v) ? 0 : v,
          hasData: v !== null && Number.isFinite(v),
        };
      });
    }

    // marketing / marketingMix
    const dimCol =
      dimension === "region" ? "r.name" :
      dimension === "product" ? "p.name" :
      dimension === "channel" ? "md.channel" : "md.campaign";
    let join = "";
    if (dimension === "region") join = "JOIN regions r ON md.region_id = r.id";
    else if (dimension === "product") join = "JOIN products p ON md.product_id = p.id";

    let where = "WHERE md.date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];
    if (regionId !== undefined) { where += " AND md.region_id = ?"; params.push(regionId); }
    if (productId !== undefined) { where += " AND md.product_id = ?"; params.push(productId); }
    if (filters?.channel) { where += " AND md.channel = ?"; params.push(filters.channel); }
    if (filters?.campaign) { where += " AND md.campaign = ?"; params.push(filters.campaign); }

    const rows = await db.all(
      `SELECT ${dimCol} AS dv,
              COALESCE(SUM(md.sessions), 0)           AS sessions,
              COALESCE(SUM(md.conversions), 0)        AS conversions,
              COALESCE(SUM(md.marketing_spend), 0)    AS spend,
              COALESCE(SUM(md.attributed_revenue), 0) AS attributedRevenue
       FROM marketing_daily md ${join} ${where} GROUP BY ${dimCol}`,
      ...params
    );
    const fn = spec.marketing ?? ((a: MarketingAgg) => {
      const r = safeDiv(a.conversions, a.sessions);
      return r === null ? null : r * 100;
    });
    return rows.map((r) => {
      const v = fn({
        sessions: r.sessions || 0,
        conversions: r.conversions || 0,
        spend: r.spend || 0,
        attributedRevenue: r.attributedRevenue || 0,
      });
      return {
        dimensionValue: r.dv,
        value: v === null || !Number.isFinite(v) ? 0 : v,
        hasData: v !== null && Number.isFinite(v),
      };
    });
  });
}

/**
 * Shared analysis window. Association and temporal MUST request the same month
 * list, otherwise they produce different cache keys and each pays for its own
 * scan of the 537k-row sales table.
 */
export const ANALYSIS_WINDOW_MONTHS = 24;

/** Build the trailing `count` months ending at (and including) `endPeriod`. */
export function getMonthsForPeriod(endPeriod: string, count: number): string[] {
  const months: string[] = [];
  const [year, month] = endPeriod.split("-").map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}
