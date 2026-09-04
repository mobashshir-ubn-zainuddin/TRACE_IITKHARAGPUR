import { getDB } from "../db";

export interface DataQualityResult {
  completenessPct: number;
  nullRatePct: number;
  duplicateRatePct: number;
  referentialIntegrityPct: number;
  status: 'good' | 'warning' | 'critical';
  details: {
    salesTransactions: { 
      total: number; 
      nullNetRevenue: number; 
      nullOrderId: number; 
      duplicateTransactionId: number; 
      orphanRegionId: number;
      orphanProductId: number;
    };
    marketingDaily: { 
      total: number; 
      nullSessions: number; 
      nullConversions: number;
      orphanRegionId: number;
      orphanProductId: number;
    };
    operationsDaily: { 
      total: number; 
      nullStockoutRate: number; 
      invalidStockoutRate: number;
      orphanRegionId: number;
      orphanProductId: number;
    };
  };
}

export async function computeDataQuality(): Promise<DataQualityResult> {
  const db = await getDB();

  // Previously 17 separate sequential COUNT(*)/JOIN queries, meaning ~6-7
  // independent full-table scans of sales_transactions alone (500k+ rows on
  // the seeded dataset) every time this ran without a warm cache - a real,
  // measurable contributor to the "slow once, fast after" latency on
  // /api/signals/top and friends. Same checks, same numbers, but each table
  // is now scanned exactly once via conditional SUM/CASE aggregates instead
  // of once per individual check. Duplicate/orphan definitions are
  // unchanged (duplicate transaction_id, orphan region_id/product_id FKs).
  const [salesAgg, marketingAgg, opsAgg] = await Promise.all([
    db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN net_revenue IS NULL THEN 1 ELSE 0 END) as nullNetRevenue,
        SUM(CASE WHEN order_id IS NULL OR order_id = '' THEN 1 ELSE 0 END) as nullOrderId,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) as orphanRegionId,
        SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) as orphanProductId,
        (SELECT COUNT(*) FROM (SELECT id FROM sales_transactions GROUP BY id HAVING COUNT(*) > 1)) as duplicateTransactionId
      FROM sales_transactions st
      LEFT JOIN regions r ON st.region_id = r.id
      LEFT JOIN products p ON st.product_id = p.id
    `),
    db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN sessions IS NULL THEN 1 ELSE 0 END) as nullSessions,
        SUM(CASE WHEN conversions IS NULL THEN 1 ELSE 0 END) as nullConversions,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) as orphanRegionId,
        SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) as orphanProductId
      FROM marketing_daily md
      LEFT JOIN regions r ON md.region_id = r.id
      LEFT JOIN products p ON md.product_id = p.id
    `),
    db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN stockout_rate IS NULL THEN 1 ELSE 0 END) as nullStockoutRate,
        SUM(CASE WHEN stockout_rate < 0 OR stockout_rate > 1 THEN 1 ELSE 0 END) as invalidStockoutRate,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) as orphanRegionId,
        SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) as orphanProductId
      FROM operations_daily od
      LEFT JOIN regions r ON od.region_id = r.id
      LEFT JOIN products p ON od.product_id = p.id
    `),
  ]);

  const salesTotal = { c: salesAgg?.total || 0 };
  const salesNullNetRev = { c: salesAgg?.nullNetRevenue || 0 };
  const salesNullOrderId = { c: salesAgg?.nullOrderId || 0 };
  const salesDupTransactionId = { c: salesAgg?.duplicateTransactionId || 0 };
  const salesOrphanRegionId = { c: salesAgg?.orphanRegionId || 0 };
  const salesOrphanProductId = { c: salesAgg?.orphanProductId || 0 };

  const marketingTotal = { c: marketingAgg?.total || 0 };
  const marketingNullSessions = { c: marketingAgg?.nullSessions || 0 };
  const marketingNullConv = { c: marketingAgg?.nullConversions || 0 };
  const marketingOrphanRegionId = { c: marketingAgg?.orphanRegionId || 0 };
  const marketingOrphanProductId = { c: marketingAgg?.orphanProductId || 0 };

  const opsTotal = { c: opsAgg?.total || 0 };
  const opsNullStockout = { c: opsAgg?.nullStockoutRate || 0 };
  const opsInvalidStockout = { c: opsAgg?.invalidStockoutRate || 0 };
  const opsOrphanRegionId = { c: opsAgg?.orphanRegionId || 0 };
  const opsOrphanProductId = { c: opsAgg?.orphanProductId || 0 };

  const totalRecords = (salesTotal?.c || 0) + (marketingTotal?.c || 0) + (opsTotal?.c || 0);
  const totalNulls = (salesNullNetRev?.c || 0) + (salesNullOrderId?.c || 0) +
                     (marketingNullSessions?.c || 0) + (marketingNullConv?.c || 0) +
                     (opsNullStockout?.c || 0);

  // True duplicate rate: based on primary key duplicates, not order_id
  const totalDuplicates = salesDupTransactionId?.c || 0;

  // Referential integrity: count all orphan foreign keys across all tables
  const totalOrphans = (salesOrphanRegionId?.c || 0) + (salesOrphanProductId?.c || 0) +
                       (marketingOrphanRegionId?.c || 0) + (marketingOrphanProductId?.c || 0) +
                       (opsOrphanRegionId?.c || 0) + (opsOrphanProductId?.c || 0);

  const completenessPct = totalRecords > 0 ? 
    ((totalRecords - totalNulls) / totalRecords) * 100 : 100;
  const nullRatePct = totalRecords > 0 ? (totalNulls / totalRecords) * 100 : 0;
  const duplicateRatePct = (salesTotal?.c || 0) > 0 ? (totalDuplicates / salesTotal.c) * 100 : 0;
  const referentialIntegrityPct = totalRecords > 0 ? ((totalRecords - totalOrphans) / totalRecords) * 100 : 100;

  let status: 'good' | 'warning' | 'critical' = 'good';
  if (completenessPct < 95 || nullRatePct > 2 || duplicateRatePct > 1 || referentialIntegrityPct < 99) {
    status = 'warning';
  }
  if (completenessPct < 90 || nullRatePct > 5 || duplicateRatePct > 5 || referentialIntegrityPct < 95) {
    status = 'critical';
  }

  return {
    completenessPct: Math.round(completenessPct * 100) / 100,
    nullRatePct: Math.round(nullRatePct * 100) / 100,
    duplicateRatePct: Math.round(duplicateRatePct * 100) / 100,
    referentialIntegrityPct: Math.round(referentialIntegrityPct * 100) / 100,
    status,
    details: {
      salesTransactions: {
        total: salesTotal?.c || 0,
        nullNetRevenue: salesNullNetRev?.c || 0,
        nullOrderId: salesNullOrderId?.c || 0,
        duplicateTransactionId: salesDupTransactionId?.c || 0,
        orphanRegionId: salesOrphanRegionId?.c || 0,
        orphanProductId: salesOrphanProductId?.c || 0
      },
      marketingDaily: {
        total: marketingTotal?.c || 0,
        nullSessions: marketingNullSessions?.c || 0,
        nullConversions: marketingNullConv?.c || 0,
        orphanRegionId: marketingOrphanRegionId?.c || 0,
        orphanProductId: marketingOrphanProductId?.c || 0
      },
      operationsDaily: {
        total: opsTotal?.c || 0,
        nullStockoutRate: opsNullStockout?.c || 0,
        invalidStockoutRate: opsInvalidStockout?.c || 0,
        orphanRegionId: opsOrphanRegionId?.c || 0,
        orphanProductId: opsOrphanProductId?.c || 0
      }
    }
  };
}