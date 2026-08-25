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

  // Sales transactions quality checks
  const salesTotal = await db.get("SELECT COUNT(*) as c FROM sales_transactions");
  const salesNullNetRev = await db.get("SELECT COUNT(*) as c FROM sales_transactions WHERE net_revenue IS NULL");
  const salesNullOrderId = await db.get("SELECT COUNT(*) as c FROM sales_transactions WHERE order_id IS NULL OR order_id = ''");
  
  // True duplicate check: duplicate transaction_id (primary key), not order_id
  const salesDupTransactionId = await db.get(`
    SELECT COUNT(*) as c FROM (
      SELECT id FROM sales_transactions
      GROUP BY id HAVING COUNT(*) > 1
    )
  `);
  
  // Referential integrity: orphan region_id and product_id
  const salesOrphanRegionId = await db.get(`
    SELECT COUNT(*) as c FROM sales_transactions st
    LEFT JOIN regions r ON st.region_id = r.id
    WHERE r.id IS NULL
  `);
  const salesOrphanProductId = await db.get(`
    SELECT COUNT(*) as c FROM sales_transactions st
    LEFT JOIN products p ON st.product_id = p.id
    WHERE p.id IS NULL
  `);

  // Marketing daily quality checks
  const marketingTotal = await db.get("SELECT COUNT(*) as c FROM marketing_daily");
  const marketingNullSessions = await db.get("SELECT COUNT(*) as c FROM marketing_daily WHERE sessions IS NULL");
  const marketingNullConv = await db.get("SELECT COUNT(*) as c FROM marketing_daily WHERE conversions IS NULL");
  
  // Referential integrity for marketing_daily
  const marketingOrphanRegionId = await db.get(`
    SELECT COUNT(*) as c FROM marketing_daily md
    LEFT JOIN regions r ON md.region_id = r.id
    WHERE r.id IS NULL
  `);
  const marketingOrphanProductId = await db.get(`
    SELECT COUNT(*) as c FROM marketing_daily md
    LEFT JOIN products p ON md.product_id = p.id
    WHERE p.id IS NULL
  `);

  // Operations daily quality checks
  const opsTotal = await db.get("SELECT COUNT(*) as c FROM operations_daily");
  const opsNullStockout = await db.get("SELECT COUNT(*) as c FROM operations_daily WHERE stockout_rate IS NULL");
  const opsInvalidStockout = await db.get("SELECT COUNT(*) as c FROM operations_daily WHERE stockout_rate < 0 OR stockout_rate > 1");
  
  // Referential integrity for operations_daily
  const opsOrphanRegionId = await db.get(`
    SELECT COUNT(*) as c FROM operations_daily od
    LEFT JOIN regions r ON od.region_id = r.id
    WHERE r.id IS NULL
  `);
  const opsOrphanProductId = await db.get(`
    SELECT COUNT(*) as c FROM operations_daily od
    LEFT JOIN products p ON od.product_id = p.id
    WHERE p.id IS NULL
  `);

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