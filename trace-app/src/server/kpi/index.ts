import { getDB } from "../db";
import { getKPIDefinition, normalizeMetric } from "./definitions";
import { buildLineage } from "./lineage";
import { computeDataQuality } from "./quality";
import { computeFreshness } from "./freshness";
import type { KPIResponse } from "../types";

async function resolveRegionId(region?: string): Promise<number | undefined> {
  if (!region) return undefined;
  const db = await getDB();
  const row = await db.get("SELECT id FROM regions WHERE name = ?", region);
  if (!row) {
    throw new Error(`Unknown region: ${region}`);
  }
  return row.id;
}

async function resolveProductId(product?: string): Promise<number | undefined> {
  if (!product) return undefined;
  const db = await getDB();
  const row = await db.get("SELECT id FROM products WHERE name = ?", product);
  if (!row) {
    throw new Error(`Unknown product: ${product}`);
  }
  return row.id;
}

function monthToDateRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split("-").map(Number);
  const start = `${year}-${monthNum.toString().padStart(2, "0")}-01`;
  const endDate = new Date(year, monthNum, 0);
  const endDay = endDate.getDate().toString().padStart(2, "0");
  const end = `${year}-${monthNum.toString().padStart(2, "0")}-${endDay}`;
  return { start, end };
}

function prevMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  let prevYear = year;
  let prevMonthNum = monthNum - 1;
  if (prevMonthNum === 0) {
    prevMonthNum = 12;
    prevYear = year - 1;
  }
  return `${prevYear}-${prevMonthNum.toString().padStart(2, "0")}`;
}

async function computeRevenue(filters: { month: string; region?: string; product?: string; channel?: string }): Promise<{ current: number; previous: number }> {
  const db = await getDB();
  const { start, end } = monthToDateRange(filters.month);
  const prevMonthStr = prevMonth(filters.month);
  const { start: prevStart, end: prevEnd } = monthToDateRange(prevMonthStr);

  let whereClause = "WHERE transaction_date BETWEEN ? AND ?";
  const params: (string | number)[] = [start, end];
  const prevParams: (string | number)[] = [prevStart, prevEnd];

  if (filters.region) {
    const regionId = await resolveRegionId(filters.region);
    if (regionId) {
      whereClause += " AND region_id = ?";
      params.push(regionId);
      prevParams.push(regionId);
    }
  }
  if (filters.product) {
    const productId = await resolveProductId(filters.product);
    if (productId) {
      whereClause += " AND product_id = ?";
      params.push(productId);
      prevParams.push(productId);
    }
  }
  if (filters.channel) {
    whereClause += " AND channel = ?";
    params.push(filters.channel);
    prevParams.push(filters.channel);
  }

  const current = await db.get(
    `SELECT COALESCE(SUM(net_revenue), 0) as val FROM sales_transactions ${whereClause}`,
    ...params
  );
  const previous = await db.get(
    `SELECT COALESCE(SUM(net_revenue), 0) as val FROM sales_transactions ${whereClause}`,
    ...prevParams
  );

  return { current: current?.val || 0, previous: previous?.val || 0 };
}

async function computeOrders(filters: { month: string; region?: string; product?: string; channel?: string }): Promise<{ current: number; previous: number }> {
  const db = await getDB();
  const { start, end } = monthToDateRange(filters.month);
  const prevMonthStr = prevMonth(filters.month);
  const { start: prevStart, end: prevEnd } = monthToDateRange(prevMonthStr);

  let whereClause = "WHERE transaction_date BETWEEN ? AND ?";
  const params: (string | number)[] = [start, end];
  const prevParams: (string | number)[] = [prevStart, prevEnd];

  if (filters.region) {
    const regionId = await resolveRegionId(filters.region);
    if (regionId) {
      whereClause += " AND region_id = ?";
      params.push(regionId);
      prevParams.push(regionId);
    }
  }
  if (filters.product) {
    const productId = await resolveProductId(filters.product);
    if (productId) {
      whereClause += " AND product_id = ?";
      params.push(productId);
      prevParams.push(productId);
    }
  }
  if (filters.channel) {
    whereClause += " AND channel = ?";
    params.push(filters.channel);
    prevParams.push(filters.channel);
  }

  const current = await db.get(
    `SELECT COUNT(DISTINCT order_id) as val FROM sales_transactions ${whereClause}`,
    ...params
  );
  const previous = await db.get(
    `SELECT COUNT(DISTINCT order_id) as val FROM sales_transactions ${whereClause}`,
    ...prevParams
  );

  return { current: current?.val || 0, previous: previous?.val || 0 };
}

async function computeAOV(filters: { month: string; region?: string; product?: string; channel?: string }): Promise<{ current: number; previous: number }> {
  const { current: revenue, previous: prevRevenue } = await computeRevenue(filters);
  const { current: orders, previous: prevOrders } = await computeOrders(filters);
  
  const current = orders > 0 ? revenue / orders : 0;
  const previous = prevOrders > 0 ? prevRevenue / prevOrders : 0;
  
  return { current, previous };
}

async function computeConversion(filters: { month: string; region?: string; product?: string }): Promise<{ current: number; previous: number }> {
  const db = await getDB();
  const { start, end } = monthToDateRange(filters.month);
  const prevMonthStr = prevMonth(filters.month);
  const { start: prevStart, end: prevEnd } = monthToDateRange(prevMonthStr);

  let whereClause = "WHERE date BETWEEN ? AND ?";
  const params: (string | number)[] = [start, end];
  const prevParams: (string | number)[] = [prevStart, prevEnd];

  if (filters.region) {
    const regionId = await resolveRegionId(filters.region);
    if (regionId) {
      whereClause += " AND region_id = ?";
      params.push(regionId);
      prevParams.push(regionId);
    }
  }
  if (filters.product) {
    const productId = await resolveProductId(filters.product);
    if (productId) {
      whereClause += " AND product_id = ?";
      params.push(productId);
      prevParams.push(productId);
    }
  }

  const current = await db.get(
    `SELECT 
      COALESCE(SUM(conversions), 0) as conv,
      COALESCE(SUM(sessions), 0) as sess
     FROM marketing_daily ${whereClause}`,
    ...params
  );
  const previous = await db.get(
    `SELECT 
      COALESCE(SUM(conversions), 0) as conv,
      COALESCE(SUM(sessions), 0) as sess
     FROM marketing_daily ${whereClause}`,
    ...prevParams
  );

  const currentVal = current?.sess > 0 ? (current?.conv / current?.sess) * 100 : 0;
  const previousVal = previous?.sess > 0 ? (previous?.conv / previous?.sess) * 100 : 0;

  return { current: currentVal, previous: previousVal };
}

async function computeMarketingROI(filters: { month: string; region?: string; product?: string }): Promise<{ current: number; previous: number }> {
  const db = await getDB();
  const { start, end } = monthToDateRange(filters.month);
  const prevMonthStr = prevMonth(filters.month);
  const { start: prevStart, end: prevEnd } = monthToDateRange(prevMonthStr);

  let whereClause = "WHERE date BETWEEN ? AND ?";
  const params: (string | number)[] = [start, end];
  const prevParams: (string | number)[] = [prevStart, prevEnd];

  if (filters.region) {
    const regionId = await resolveRegionId(filters.region);
    if (regionId) {
      whereClause += " AND region_id = ?";
      params.push(regionId);
      prevParams.push(regionId);
    }
  }
  if (filters.product) {
    const productId = await resolveProductId(filters.product);
    if (productId) {
      whereClause += " AND product_id = ?";
      params.push(productId);
      prevParams.push(productId);
    }
  }

  const current = await db.get(
    `SELECT 
      COALESCE(SUM(attributed_revenue), 0) as rev,
      COALESCE(SUM(marketing_spend), 0) as spend
     FROM marketing_daily ${whereClause}`,
    ...params
  );
  const previous = await db.get(
    `SELECT 
      COALESCE(SUM(attributed_revenue), 0) as rev,
      COALESCE(SUM(marketing_spend), 0) as spend
     FROM marketing_daily ${whereClause}`,
    ...prevParams
  );

  const currentVal = current?.spend > 0 ? current?.rev / current?.spend : 0;
  const previousVal = previous?.spend > 0 ? previous?.rev / previous?.spend : 0;

  return { current: currentVal, previous: previousVal };
}

export async function computeCurrentValue(normalizedMetric: string, filterObj: { month: string; region?: string; product?: string; channel?: string }): Promise<number> {
  switch (normalizedMetric) {
    case 'revenue':
      return (await computeRevenue(filterObj)).current;
    case 'orders':
      return (await computeOrders(filterObj)).current;
    case 'aov':
      return (await computeAOV(filterObj)).current;
    case 'conversion':
      return (await computeConversion(filterObj)).current;
    case 'marketingROI':
      return (await computeMarketingROI(filterObj)).current;
    default:
      throw new Error(`Unsupported metric: ${normalizedMetric}`);
  }
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const d = new Date(year, monthNum - 1 + delta, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface KPIBaseline {
  mean: number;
  std: number;
  sampleSize: number;
  months: string[];
}

/**
 * Rolling historical baseline for a metric, computed from up to `windowSize`
 * months strictly before `month` (same filters). Used to judge whether a
 * month-over-month change is a real anomaly or normal business noise.
 */
export async function computeBaseline(
  normalizedMetric: string,
  month: string,
  filters?: { region?: string; product?: string; channel?: string },
  windowSize = 6
): Promise<KPIBaseline> {
  const months: string[] = [];
  for (let i = windowSize; i >= 1; i--) {
    months.push(shiftMonth(month, -i));
  }
  const values: number[] = [];
  for (const m of months) {
    try {
      values.push(await computeCurrentValue(normalizedMetric, { month: m, ...filters }));
    } catch {
      // Skip months where the filter combination has no data (e.g. before launch).
    }
  }
  const m = mean(values);
  return { mean: m, std: stdDev(values, m), sampleSize: values.length, months };
}

export async function computeKPI(metric: string, month: string, filters?: { region?: string; product?: string; channel?: string }): Promise<KPIResponse> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const filterObj = { month, ...filters };
  let result: { current: number; previous: number };

  switch (normalizedMetric) {
    case 'revenue':
      result = await computeRevenue(filterObj);
      break;
    case 'orders':
      result = await computeOrders(filterObj);
      break;
    case 'aov':
      result = await computeAOV(filterObj);
      break;
    case 'conversion':
      result = await computeConversion(filterObj);
      break;
    case 'marketingROI':
      result = await computeMarketingROI(filterObj);
      break;
    default:
      throw new Error(`Unsupported metric: ${normalizedMetric}`);
  }

  const changePct = result.previous === 0 ? 0 : ((result.current - result.previous) / result.previous) * 100;

  const quality = await computeDataQuality();
  const freshness = await computeFreshness(normalizedMetric);

  const lineage = buildLineage(normalizedMetric, { month, ...filters });

  // Statistical significance: is this month unusual relative to its own trailing
  // history, not just relative to last month? A single-month dip/spike can be
  // noise; a multi-sigma deviation from the rolling baseline is a real signal.
  const baseline = await computeBaseline(normalizedMetric, month, filters);
  const zScore = baseline.std > 0 ? (result.current - baseline.mean) / baseline.std : 0;
  const baselineDeltaPct = baseline.mean !== 0 ? ((result.current - baseline.mean) / baseline.mean) * 100 : 0;

  const materiality = def.materialityThreshold;
  const meetsMateriality =
    (materiality.relative !== undefined && Math.abs(changePct) / 100 >= materiality.relative) ||
    (materiality.absolute !== undefined && Math.abs(result.current - result.previous) >= materiality.absolute);

  const hasEnoughHistory = baseline.sampleSize >= 3;
  const absZ = Math.abs(zScore);
  const is_anomaly = hasEnoughHistory ? (absZ >= 2 && meetsMateriality) : meetsMateriality;
  const severity: 'low' | 'medium' | 'high' = !is_anomaly
    ? 'low'
    : (hasEnoughHistory ? absZ >= 3 : Math.abs(changePct) >= 30)
      ? 'high'
      : (hasEnoughHistory ? absZ >= 2.5 : Math.abs(changePct) >= 20)
        ? 'medium'
        : 'low';

  return {
    metric: def.name,
    label: def.label,
    period: month,
    month: month, // backward compatibility
    value: Math.round(result.current * 100) / 100,
    previousValue: Math.round(result.previous * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    unit: def.unit,
    dimensions: { region: filters?.region, product: filters?.product, channel: filters?.channel },
    source: { table: def.source, columns: def.sourceColumns },
    lineage: { formula: def.formula, filters: { month, ...filters }, generatedAt: lineage.generatedAt },
    quality: { status: quality.status, completenessPct: quality.completenessPct },
    freshness: { status: freshness[0]?.freshnessStatus || 'fresh', source: freshness[0]?.source || 'unknown' },
    is_anomaly,
    severity,
    baseline: {
      mean: Math.round(baseline.mean * 100) / 100,
      std: Math.round(baseline.std * 100) / 100,
      sampleSize: baseline.sampleSize,
      deltaFromBaselinePct: Math.round(baselineDeltaPct * 100) / 100,
    },
    zScore: Math.round(zScore * 100) / 100,
    normalRange: {
      low: Math.round((baseline.mean - 1.5 * baseline.std) * 100) / 100,
      high: Math.round((baseline.mean + 1.5 * baseline.std) * 100) / 100,
    },
  };
}

export async function getKPIHistory(metric: string, filters?: { region?: string; product?: string; start?: string; end?: string }): Promise<Array<{ period: string; value: number }>> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const months = filters?.start && filters?.end 
    ? getMonthsInRange(filters.start, filters.end)
    : getLastNMonths(12);

  const results = [];
  for (const month of months) {
    try {
      const kpi = await computeKPI(normalizedMetric, month, { region: filters?.region, product: filters?.product });
      results.push({ period: month, value: kpi.value });
    } catch {
      results.push({ period: month, value: 0 });
    }
  }
  return results;
}

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

function getMonthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      months.push(`${y}-${m.toString().padStart(2, "0")}`);
    }
  }
  return months;
}

export async function getKPIBreakdown(metric: string, month: string, dimension: string, filters?: { region?: string; product?: string }): Promise<Array<{ dimensionValue: string; value: number; contributionPct: number }>> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const db = await getDB();
  const { start, end } = monthToDateRange(month);

  let dimensionColumn: string;

  switch (dimension) {
    case 'region':
      dimensionColumn = "r.name";
      break;
    case 'product':
      dimensionColumn = "p.name";
      break;
    case 'channel':
      dimensionColumn = "st.channel";
      break;
    default:
      throw new Error(`Unsupported dimension: ${dimension}`);
  }

  let whereClause = "WHERE st.transaction_date BETWEEN ? AND ?";
  const params: (string | number)[] = [start, end];

  if (filters?.region) {
    const regionId = await resolveRegionId(filters.region);
    if (regionId) {
      whereClause += " AND st.region_id = ?";
      params.push(regionId);
    }
  }
  if (filters?.product) {
    const productId = await resolveProductId(filters.product);
    if (productId) {
      whereClause += " AND st.product_id = ?";
      params.push(productId);
    }
  }

  let selectClause = "";

  if (normalizedMetric === 'revenue') {
    selectClause = `SUM(st.net_revenue) as val`;
  } else if (normalizedMetric === 'orders') {
    selectClause = `COUNT(DISTINCT st.order_id) as val`;
  } else if (normalizedMetric === 'aov') {
    selectClause = `CASE WHEN COUNT(DISTINCT st.order_id) > 0 THEN SUM(st.net_revenue) / COUNT(DISTINCT st.order_id) ELSE 0 END as val`;
  } else {
    throw new Error(`Breakdown not supported for metric: ${normalizedMetric}`);
  }

  let joinClause = "";
  if (dimension === 'region') {
    joinClause = "JOIN regions r ON st.region_id = r.id";
  } else if (dimension === 'product') {
    joinClause = "JOIN products p ON st.product_id = p.id";
  }

  const query = `
    SELECT ${dimensionColumn} as dimension_value, ${selectClause}
    FROM sales_transactions st
    ${joinClause}
    ${whereClause}
    GROUP BY ${dimensionColumn}
    ORDER BY val DESC
  `;

  const rows = await db.all(query, ...params);
  const total = rows.reduce((sum, r) => sum + (r.val || 0), 0);

  return rows.map(r => ({
    dimensionValue: r.dimension_value,
    value: Math.round((r.val || 0) * 100) / 100,
    contributionPct: total > 0 ? Math.round(((r.val || 0) / total) * 10000) / 100 : 0
  }));
}