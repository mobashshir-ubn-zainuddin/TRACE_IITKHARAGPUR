import { getDB } from "../db";
import { getKPIDefinition, normalizeMetric } from "./definitions";
import { buildLineage } from "./lineage";
import { computeDataQuality } from "./quality";
import { computeFreshness } from "./freshness";
import { monthToDateRange, prevMonth } from "../utils/dateUtils";
import type { KPIResponse } from "../types";

export async function resolveRegionId(region?: string): Promise<number | undefined> {
  if (!region) return undefined;
  const db = await getDB();
  const row = await db.get("SELECT id FROM regions WHERE name = ?", region);
  if (!row) {
    throw new Error(`Unknown region: ${region}`);
  }
  return row.id;
}

export async function resolveProductId(product?: string): Promise<number | undefined> {
  if (!product) return undefined;
  const db = await getDB();
  const row = await db.get("SELECT id FROM products WHERE name = ?", product);
  if (!row) {
    throw new Error(`Unknown product: ${product}`);
  }
  return row.id;
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
  const relevantFreshness = freshness[0];

  const lineage = buildLineage(normalizedMetric, { month, ...filters });

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
    quality,
    freshness: relevantFreshness ? { ...relevantFreshness, status: relevantFreshness.freshnessStatus } : { 
      source: 'unknown', 
      sourceType: 'unknown', 
      grain: 'unknown', 
      refreshCadence: 'unknown', 
      lastRefreshedAt: new Date().toISOString(), 
      freshnessStatus: 'critical', 
      hoursSinceRefresh: 0,
      status: 'critical'
    },
    is_anomaly: Math.abs(changePct) > 20,
    severity: Math.abs(changePct) > 30 ? 'high' : Math.abs(changePct) > 20 ? 'medium' : 'low'
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

  return getKPIHistoryBatched(normalizedMetric, months, filters);
}

export async function getKPIHistoryBatched(metric: string, months: string[], filters?: { region?: string; product?: string; channel?: string }): Promise<Array<{ period: string; value: number }>> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const db = await getDB();
  const results: Array<{ period: string; value: number }> = [];

  if (normalizedMetric === 'revenue' || normalizedMetric === 'orders') {
    const column = normalizedMetric === 'revenue' ? 'SUM(net_revenue)' : 'COUNT(DISTINCT order_id)';
    const regionId = filters?.region ? await resolveRegionId(filters.region) : undefined;
    const productId = filters?.product ? await resolveProductId(filters.product) : undefined;

    let whereClause = "";
    const params: (string | number)[] = [];
    const monthConditions: string[] = [];

    for (const month of months) {
      const { start, end } = monthToDateRange(month);
      monthConditions.push(`(transaction_date BETWEEN ? AND ?`);
      params.push(start, end);
      if (regionId) {
        monthConditions[monthConditions.length - 1] += ` AND region_id = ?`;
        params.push(regionId);
      }
      if (productId) {
        monthConditions[monthConditions.length - 1] += ` AND product_id = ?`;
        params.push(productId);
      }
      if (filters?.channel) {
        monthConditions[monthConditions.length - 1] += ` AND channel = ?`;
        params.push(filters.channel);
      }
      monthConditions[monthConditions.length - 1] += `)`;
    }

    whereClause = monthConditions.join(" OR ");

    const query = `SELECT 
      strftime('%Y-%m', transaction_date) as period,
      ${column} as val
    FROM sales_transactions
    WHERE ${whereClause}
    GROUP BY strftime('%Y-%m', transaction_date)
    ORDER BY period`;

    const rows = await db.all(query, ...params);
    const rowMap = new Map(rows.map(r => [r.period, r.val || 0]));

    for (const month of months) {
      results.push({ period: month, value: rowMap.get(month) || 0 });
    }
  } else if (normalizedMetric === 'aov') {
    const revenueHistory = await getKPIHistoryBatched('revenue', months, filters);
    const ordersHistory = await getKPIHistoryBatched('orders', months, filters);
    const revenueMap = new Map(revenueHistory.map(r => [r.period, r.value]));
    const ordersMap = new Map(ordersHistory.map(r => [r.period, r.value]));
    
    for (const month of months) {
      const revenue = revenueMap.get(month) || 0;
      const orders = ordersMap.get(month) || 0;
      results.push({ period: month, value: orders > 0 ? revenue / orders : 0 });
    }
  } else if (normalizedMetric === 'conversion' || normalizedMetric === 'marketingROI') {
    const table = 'marketing_daily';
    const regionId = filters?.region ? await resolveRegionId(filters.region) : undefined;
    const productId = filters?.product ? await resolveProductId(filters.product) : undefined;

    let selectClause = "";
    if (normalizedMetric === 'conversion') {
      selectClause = `CASE WHEN SUM(sessions) > 0 THEN SUM(conversions) * 100.0 / SUM(sessions) ELSE 0 END`;
    } else {
      selectClause = `CASE WHEN SUM(marketing_spend) > 0 THEN SUM(attributed_revenue) * 1.0 / SUM(marketing_spend) ELSE 0 END`;
    }

    let whereClause = "";
    const params: (string | number)[] = [];
    const monthConditions: string[] = [];

    for (const month of months) {
      const { start, end } = monthToDateRange(month);
      monthConditions.push(`(date BETWEEN ? AND ?`);
      params.push(start, end);
      if (regionId) {
        monthConditions[monthConditions.length - 1] += ` AND region_id = ?`;
        params.push(regionId);
      }
      if (productId) {
        monthConditions[monthConditions.length - 1] += ` AND product_id = ?`;
        params.push(productId);
      }
      monthConditions[monthConditions.length - 1] += `)`;
    }

    whereClause = monthConditions.join(" OR ");

    const query = `SELECT 
      strftime('%Y-%m', date) as period,
      ${selectClause} as val
    FROM marketing_daily
    WHERE ${whereClause}
    GROUP BY strftime('%Y-%m', date)
    ORDER BY period`;

    const rows = await db.all(query, ...params);
    const rowMap = new Map(rows.map(r => [r.period, r.val || 0]));

    for (const month of months) {
      results.push({ period: month, value: rowMap.get(month) || 0 });
    }
  } else {
    for (const month of months) {
      const kpi = await computeKPI(normalizedMetric, month, { region: filters?.region, product: filters?.product, channel: filters?.channel });
      results.push({ period: month, value: kpi.value });
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

  // Handle metrics from sales_transactions
  if (normalizedMetric === 'revenue' || normalizedMetric === 'orders' || normalizedMetric === 'aov') {
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

  // Handle metrics from marketing_daily
  if (normalizedMetric === 'conversion' || normalizedMetric === 'marketingROI') {
    let dimensionColumn: string;
    let joinClause = "";

    switch (dimension) {
      case 'region':
        dimensionColumn = "r.name";
        joinClause = "JOIN regions r ON md.region_id = r.id";
        break;
      case 'product':
        dimensionColumn = "p.name";
        joinClause = "JOIN products p ON md.product_id = p.id";
        break;
      default:
        throw new Error(`Unsupported dimension for ${normalizedMetric}: ${dimension}. Supported: region, product`);
    }

    let whereClause = "WHERE md.date BETWEEN ? AND ?";
    const params: (string | number)[] = [start, end];

    if (filters?.region) {
      const regionId = await resolveRegionId(filters.region);
      if (regionId) {
        whereClause += " AND md.region_id = ?";
        params.push(regionId);
      }
    }
    if (filters?.product) {
      const productId = await resolveProductId(filters.product);
      if (productId) {
        whereClause += " AND md.product_id = ?";
        params.push(productId);
      }
    }

    let selectClause = "";
    if (normalizedMetric === 'conversion') {
      selectClause = `CASE WHEN SUM(md.sessions) > 0 THEN SUM(md.conversions) * 100.0 / SUM(md.sessions) ELSE 0 END as val`;
    } else if (normalizedMetric === 'marketingROI') {
      selectClause = `CASE WHEN SUM(md.marketing_spend) > 0 THEN SUM(md.attributed_revenue) * 1.0 / SUM(md.marketing_spend) ELSE 0 END as val`;
    }

    const query = `
      SELECT ${dimensionColumn} as dimension_value, ${selectClause}
      FROM marketing_daily md
      ${joinClause}
      ${whereClause}
      GROUP BY ${dimensionColumn}
      ORDER BY val DESC
    `;

    const rows = await db.all(query, ...params);
    
    // For conversion and marketingROI, contribution doesn't make sense as a percentage of total
    // Return the raw values
    return rows.map(r => ({
      dimensionValue: r.dimension_value,
      value: Math.round((r.val || 0) * 100) / 100,
      contributionPct: 0 // Not applicable for rate/ratio metrics
    }));
  }

  throw new Error(`Breakdown not supported for metric: ${normalizedMetric}`);
}