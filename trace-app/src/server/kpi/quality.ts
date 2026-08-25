import { getDB } from "../db";

export interface DataQualityResult {
  completenessPct: number;
  nullRatePct: number;
  duplicateRatePct: number;
  referentialIntegrityPct: number;
  status: 'good' | 'warning' | 'critical';
  details: {
    salesTransactions: { total: number; nullNetRevenue: number; nullOrderId: number; duplicateOrderId: number };
    marketingDaily: { total: number; nullSessions: number; nullConversions: number };
    operationsDaily: { total: number; nullStockoutRate: number; invalidStockoutRate: number };
  };
}

export async function computeDataQuality(): Promise<DataQualityResult> {
  const db = await getDB();

  const salesTotal = await db.get("SELECT COUNT(*) as c FROM sales_transactions");
  const salesNullNetRev = await db.get("SELECT COUNT(*) as c FROM sales_transactions WHERE net_revenue IS NULL");
  const salesNullOrderId = await db.get("SELECT COUNT(*) as c FROM sales_transactions WHERE order_id IS NULL OR order_id = ''");
  const salesDupOrderId = await db.get(`
    SELECT COUNT(*) as c FROM (
      SELECT order_id FROM sales_transactions
      GROUP BY order_id HAVING COUNT(*) > 1
    )
  `);

  const marketingTotal = await db.get("SELECT COUNT(*) as c FROM marketing_daily");
  const marketingNullSessions = await db.get("SELECT COUNT(*) as c FROM marketing_daily WHERE sessions IS NULL");
  const marketingNullConv = await db.get("SELECT COUNT(*) as c FROM marketing_daily WHERE conversions IS NULL");

  const opsTotal = await db.get("SELECT COUNT(*) as c FROM operations_daily");
  const opsNullStockout = await db.get("SELECT COUNT(*) as c FROM operations_daily WHERE stockout_rate IS NULL");
  const opsInvalidStockout = await db.get("SELECT COUNT(*) as c FROM operations_daily WHERE stockout_rate < 0 OR stockout_rate > 1");

  const totalRecords = (salesTotal?.c || 0) + (marketingTotal?.c || 0) + (opsTotal?.c || 0);
  const totalNulls = (salesNullNetRev?.c || 0) + (salesNullOrderId?.c || 0) + 
                     (marketingNullSessions?.c || 0) + (marketingNullConv?.c || 0) + 
                     (opsNullStockout?.c || 0);
  const totalDuplicates = salesDupOrderId?.c || 0;
  const totalInvalid = opsInvalidStockout?.c || 0;

  const completenessPct = totalRecords > 0 ? 
    ((totalRecords - totalNulls) / totalRecords) * 100 : 100;
  const nullRatePct = totalRecords > 0 ? (totalNulls / totalRecords) * 100 : 0;
  const duplicateRatePct = (salesTotal?.c || 0) > 0 ? (totalDuplicates / salesTotal.c) * 100 : 0;
  const referentialIntegrityPct = totalRecords > 0 ? ((totalRecords - totalInvalid) / totalRecords) * 100 : 100;

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
        duplicateOrderId: salesDupOrderId?.c || 0
      },
      marketingDaily: {
        total: marketingTotal?.c || 0,
        nullSessions: marketingNullSessions?.c || 0,
        nullConversions: marketingNullConv?.c || 0
      },
      operationsDaily: {
        total: opsTotal?.c || 0,
        nullStockoutRate: opsNullStockout?.c || 0,
        invalidStockoutRate: opsInvalidStockout?.c || 0
      }
    }
  };
}