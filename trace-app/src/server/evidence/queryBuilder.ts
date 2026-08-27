/**
 * Module 4: Query Builder
 * 
 * Converts EvidenceRequest into structured and unstructured retrieval queries.
 * The original structured terms must always remain. LLM expansion is optional.
 */

import type { EvidenceRequest, EvidenceSourceType, QueryBuilderInput, QueryBuilderOutput } from "./types";

/** Driver-specific query templates */
const DRIVER_QUERY_TEMPLATES: Record<string, string[]> = {
  stockouts: [
    "{driver} {region} {period}",
    "inventory shortage {region} {period}",
    "product availability {region} {period}",
    "out of stock {region} {period}",
    "stockout rate {region} {period}",
    "warehouse replenishment {region} {period}",
  ],
  inventory: [
    "inventory levels {region} {product} {period}",
    "stock levels {region} {product} {period}",
    "availability {region} {product} {period}",
    "fill rate {region} {product} {period}",
    "safety stock {region} {product} {period}",
  ],
  discounting: [
    "discount rate {region} {product} {period}",
    "promotional pricing {region} {product} {period}",
    "discount campaign {region} {period}",
    "pricing promotion {region} {product} {period}",
    "markdown {region} {product} {period}",
  ],
  pricing: [
    "price change {region} {product} {period}",
    "unit price {region} {product} {period}",
    "pricing strategy {region} {period}",
    "price elasticity {region} {product} {period}",
  ],
  conversion: [
    "conversion rate {region} {channel} {period}",
    "funnel conversion {region} {period}",
    "conversion drop {region} {period}",
    "conversion optimization {region} {period}",
  ],
  traffic: [
    "traffic volume {region} {channel} {period}",
    "sessions {region} {channel} {period}",
    "website traffic {region} {period}",
    "marketing sessions {region} {period}",
  ],
  marketing: [
    "marketing performance {region} {period}",
    "campaign effectiveness {region} {period}",
    "ROAS {region} {period}",
    "attributed revenue {region} {period}",
    "marketing spend {region} {period}",
  ],
  orders: [
    "order volume {region} {product} {period}",
    "orders decline {region} {period}",
    "order count {region} {product} {period}",
    "sales orders {region} {period}",
  ],
  aov: [
    "average order value {region} {product} {period}",
    "AOV decline {region} {period}",
    "order value {region} {product} {period}",
    "revenue per order {region} {period}",
  ],
  product_mix: [
    "product mix {region} {period}",
    "category mix {region} {period}",
    "product assortment {region} {period}",
    "SKU mix {region} {period}",
  ],
  refunds: [
    "refund rate {region} {product} {period}",
    "returns {region} {product} {period}",
    "refund policy {region} {period}",
  ],
  availability: [
    "product availability {region} {product} {period}",
    "stock availability {region} {product} {period}",
    "fulfillment availability {region} {period}",
  ],
};

/** Period formatting for queries */
function formatPeriodForQuery(period: string): string {
  // Convert "2026-08" to "August 2026"
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

/** Build structured SQL queries for quantitative evidence */
export function buildStructuredQueries(request: EvidenceRequest): QueryBuilderOutput["structuredQueries"] {
  const { metric, period, driver, filters } = request;
  const region = filters.region;
  const product = filters.product;
  const dateStart = filters.dateStart;
  const dateEnd = filters.dateEnd;
  
  const queries: QueryBuilderOutput["structuredQueries"] = [];
  
  // Determine which tables to query based on driver and metric
  const tablesToQuery = determineTables(metric, driver);
  
  for (const table of tablesToQuery) {
    const { sql, params, description } = buildTableQuery(table, metric, driver, period, {
      region,
      product,
      dateStart,
      dateEnd,
    });
    
    if (sql) {
      queries.push({ table, sql, params, description });
    }
  }
  
  return queries;
}

/** Determine which tables to query based on metric and driver */
function determineTables(metric: string, driver: string): string[] {
  const tables = new Set<string>();
  
  // Always include the primary KPI table
  if (["revenue", "orders", "aov"].includes(metric)) {
    tables.add("sales_transactions");
  }
  if (["conversion", "marketingROI"].includes(metric)) {
    tables.add("marketing_daily");
  }
  
  // Add driver-specific tables
  const driverTableMap: Record<string, string[]> = {
    stockouts: ["operations_daily"],
    inventory: ["operations_daily"],
    availability: ["operations_daily"],
    discounting: ["sales_transactions"],
    pricing: ["sales_transactions"],
    conversion: ["marketing_daily"],
    traffic: ["marketing_daily"],
    marketing: ["marketing_daily"],
    orders: ["sales_transactions"],
    aov: ["sales_transactions"],
    product_mix: ["sales_transactions"],
    refunds: ["sales_transactions"],
  };
  
  if (driverTableMap[driver]) {
    driverTableMap[driver].forEach(t => tables.add(t));
  }
  
  return Array.from(tables);
}

/** Build query for a specific table */
function buildTableQuery(
  table: string,
  metric: string,
  driver: string,
  period: string,
  filters: { region?: string; product?: string; dateStart?: string; dateEnd?: string }
): { sql: string; params: unknown[]; description: string } | { sql: null; params: null; description: null } {
  const { region, product, dateStart, dateEnd } = filters;
  const periodStart = dateStart || `${period}-01`;
  const periodEnd = dateEnd || `${period}-31`;
  
  let sql = "";
  let params: unknown[] = [];
  let description = "";
  
  switch (table) {
    case "sales_transactions": {
      const conditions = ["transaction_date BETWEEN ? AND ?"];
      params = [periodStart, periodEnd];
      
      if (region) {
        conditions.push("region_id = (SELECT id FROM regions WHERE name = ?)");
        params.push(region);
      }
      if (product) {
        conditions.push("product_id = (SELECT id FROM products WHERE name = ?)");
        params.push(product);
      }
      
      // Different aggregations based on metric
      if (metric === "revenue") {
        sql = `SELECT 
          SUM(net_revenue) as total_revenue,
          COUNT(DISTINCT order_id) as total_orders,
          SUM(net_revenue) * 1.0 / COUNT(DISTINCT order_id) as aov,
          SUM(discount) * 100.0 / NULLIF(SUM(gross_revenue), 0) as avg_discount_pct,
          COUNT(DISTINCT CASE WHEN net_revenue < gross_revenue THEN order_id END) * 1.0 / COUNT(DISTINCT order_id) * 100 as discounted_orders_pct
        FROM sales_transactions WHERE ${conditions.join(" AND ")}`;
        description = `Revenue, Orders, AOV, Discount metrics for ${metric} driver ${driver}`;
      } else if (metric === "orders") {
        sql = `SELECT 
          COUNT(DISTINCT order_id) as total_orders,
          SUM(quantity) as total_quantity
        FROM sales_transactions WHERE ${conditions.join(" AND ")}`;
        description = `Order count and quantity for ${driver}`;
      } else if (metric === "aov") {
        sql = `SELECT 
          SUM(net_revenue) * 1.0 / COUNT(DISTINCT order_id) as aov,
          SUM(net_revenue) as revenue,
          COUNT(DISTINCT order_id) as orders
        FROM sales_transactions WHERE ${conditions.join(" AND ")}`;
        description = `AOV components for ${driver}`;
      }
      break;
    }
    
    case "marketing_daily": {
      const conditions = ["date BETWEEN ? AND ?"];
      params = [periodStart, periodEnd];
      
      if (region) {
        conditions.push("region_id = (SELECT id FROM regions WHERE name = ?)");
        params.push(region);
      }
      if (product) {
        conditions.push("product_id = (SELECT id FROM products WHERE name = ?)");
        params.push(product);
      }
      
      sql = `SELECT 
        SUM(sessions) as total_sessions,
        SUM(conversions) as total_conversions,
        SUM(conversions) * 1.0 / NULLIF(SUM(sessions), 0) as conversion_rate,
        SUM(marketing_spend) as total_spend,
        SUM(attributed_revenue) as attributed_revenue,
        SUM(attributed_revenue) * 1.0 / NULLIF(SUM(marketing_spend), 0) as marketing_roi
      FROM marketing_daily WHERE ${conditions.join(" AND ")}`;
      description = `Marketing metrics (conversion, ROI, spend) for ${driver}`;
      break;
    }
    
    case "operations_daily": {
      const conditions = ["date BETWEEN ? AND ?"];
      params = [periodStart, periodEnd];
      
      if (region) {
        conditions.push("region_id = (SELECT id FROM regions WHERE name = ?)");
        params.push(region);
      }
      if (product) {
        conditions.push("product_id = (SELECT id FROM products WHERE name = ?)");
        params.push(product);
      }
      
      sql = `SELECT 
        AVG(stockout_rate) as avg_stockout_rate,
        MAX(stockout_rate) as max_stockout_rate,
        AVG(inventory_available) as avg_inventory,
        AVG(delivery_delay_rate) as avg_delivery_delay
      FROM operations_daily WHERE ${conditions.join(" AND ")}`;
      description = `Operations metrics (stockout, inventory, delivery) for ${driver}`;
      break;
    }
  }
  
  return sql ? { sql, params, description } : { sql: null, params: null, description: null };
}

/** Build unstructured search queries */
export function buildUnstructuredQueries(request: EvidenceRequest): QueryBuilderOutput["unstructuredQueries"] {
  const { metric, period, driver, filters, requiredEvidence } = request;
  const region = filters.region;
  const product = filters.product;
  const dateStart = filters.dateStart;
  const dateEnd = filters.dateEnd;
  const periodFormatted = formatPeriodForQuery(period);
  
  const queries: QueryBuilderOutput["unstructuredQueries"] = [];
  
  // Get driver-specific templates
  const templates = DRIVER_QUERY_TEMPLATES[driver] || [
    "{driver} {region} {period}",
    "{driver} {product} {period}",
    "{driver} {region} {product} {period}",
  ];
  
  // Generate queries from templates
  for (const template of templates) {
    const query = template
      .replace("{driver}", driver)
      .replace("{region}", region || "")
      .replace("{product}", product || "")
      .replace("{period}", periodFormatted)
      .replace(/\s+/g, " ")
      .trim();
    
    if (query.length > 5) {
      queries.push({
        query,
        filters: {
          region,
          product,
          dateStart,
          dateEnd,
          sourceType: getSourceTypesForDriver(driver),
        },
        requiredEvidence: [...requiredEvidence],
      });
    }
  }
  
  // Add required evidence specific queries
  for (const evidence of requiredEvidence) {
    const query = `${evidence} ${region || ""} ${product || ""} ${periodFormatted}`.trim();
    queries.push({
      query,
      filters: {
        region,
        product,
        dateStart,
        dateEnd,
      },
      requiredEvidence: [evidence],
    });
  }
  
  return queries;
}

/** Get relevant source types for a driver */
function getSourceTypesForDriver(driver: string): EvidenceSourceType[] {
  const sourceTypeMap: Record<string, EvidenceSourceType[]> = {
    stockouts: ["operations_report", "inventory_report", "support_ticket", "fulfillment_report"],
    inventory: ["inventory_report", "operations_report", "fulfillment_report"],
    discounting: ["pricing_report", "marketing_report", "internal_report"],
    pricing: ["pricing_report", "internal_report", "marketing_report"],
    conversion: ["marketing_report", "support_ticket", "internal_report"],
    traffic: ["marketing_report", "internal_report"],
    marketing: ["marketing_report", "internal_report"],
    orders: ["sales_transactions", "marketing_report", "internal_report"],
    aov: ["pricing_report", "sales_transactions", "internal_report"],
    product_mix: ["internal_report", "marketing_report", "pricing_report"],
    refunds: ["support_ticket", "internal_report", "operations_report"],
    availability: ["inventory_report", "operations_report", "fulfillment_report", "support_ticket"],
  };
  
  return sourceTypeMap[driver] || ["internal_report", "support_ticket", "operations_report", "marketing_report"];
}

/** Optional LLM query expansion (placeholder for future LLM integration) */
export async function expandQueriesWithLLM(
  queries: QueryBuilderOutput["unstructuredQueries"]
): Promise<QueryBuilderOutput["unstructuredQueries"]> {
  // Placeholder for LLM-based query expansion
  // When LLM is available, this would expand terms like:
  // "stockout" -> "out of stock, inventory shortage, product unavailable, availability issue, fulfillment shortage"
  // For now, return original queries
  return queries;
}

/** Main query builder function */
export async function buildQueries(input: QueryBuilderInput): Promise<QueryBuilderOutput> {
  const { evidenceRequest, analysisContext } = input;
  
  const structuredQueries = buildStructuredQueries(evidenceRequest);
  const unstructuredQueries = buildUnstructuredQueries(evidenceRequest);
  
  // Expanded terms would come from LLM in the future
  const expandedTerms: string[] = [];
  
  return {
    structuredQueries,
    unstructuredQueries,
    expandedTerms,
  };
}