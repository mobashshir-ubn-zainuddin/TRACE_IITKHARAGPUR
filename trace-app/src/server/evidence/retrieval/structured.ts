/**
 * Module 4: Structured Retrieval
 * 
 * Executes structured SQL queries from the query builder against the governed data layer.
 * Returns structured evidence with proper provenance and structured data.
 */

import { getDB } from "../../db";
import type { EvidenceRequest, EvidenceItem, Provenance, EvidenceSourceType } from "../types";
import { hashContent } from "./keyword";

type RetrievalMethod = "structured" | "keyword" | "vector" | "hybrid";

export interface StructuredSearchResult {
  evidence: EvidenceItem[];
  latencyMs: number;
  queryCount: number;
}

/** Metric keys that can be returned from structured queries */
const METRIC_KEYS = [
  "total_revenue", "total_orders", "aov", "avg_discount_pct", "discounted_orders_pct",
  "total_quantity", "total_sessions", "total_conversions", "conversion_rate",
  "total_spend", "attributed_revenue", "marketing_roi",
  "avg_stockout_rate", "max_stockout_rate", "avg_inventory", "avg_delivery_delay"
];

/** Execute structured SQL queries from the query builder */
export async function structuredSearch(request: EvidenceRequest): Promise<StructuredSearchResult> {
  const startTime = Date.now();
  
  // Import the query builder dynamically to avoid circular dependencies
  const { buildQueries } = await import("../queryBuilder");
  const { structuredQueries } = await buildQueries({ evidenceRequest: request });
  
  const db = await (await import("../../db")).getDB();
  
  const allEvidence: EvidenceItem[] = [];
  let queryCount = 0;
  
  for (const query of structuredQueries) {
    if (!query.sql) continue;
    
    const rows = await (await import("../../db")).getDB().then(db => db.all(query.sql, ...query.params));
    
    if (rows.length === 0) continue;
    
    // Convert rows to evidence items
    for (const row of rows) {
      // Find metric keys in the row (exclude metadata columns)
      const metricKeys = Object.keys(row).filter(k => 
        !['table', 'query', 'description'].includes(k)
      );
      
      for (const metric of metricKeys) {
        const value = row[metric];
        if (value === null || value === undefined) continue;
        
        const valueNum = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(valueNum)) continue;
        
        const changePct = row[`${metric}_change_pct`] || row[`${metric}_pct`];
        
const provenance: Provenance = {
          source: "governed",
          sourceType: "structured" as const,
          metric: "",
          period: "",
          query: `Structured query for ${metric}`,
          contentHash: hashContent(JSON.stringify({ metric, value: valueNum })),
          timestamp: new Date().toISOString(),
          retrievalMethod: "structured" as RetrievalMethod,
        };
        
        const evidence = {
          id: `structured-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          hypothesisId: "",
          driver: "structured",
          text: `${metric}: ${valueNum.toLocaleString()} (${changePct ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%` : 'N/A'})`,
          direction: "neutral" as const,
          semanticRelevance: 1.0,
          sourceQuality: 1.0,
          temporalRelevance: 1.0,
          entityRelevance: 1.0,
          hypothesisAlignment: 0.5,
          evidenceScore: 0,
          provenance: {
            source: "governed",
            sourceType: "structured" as const,
            metric: "",
            period: "",
            query: `Structured query for ${metric}`,
            contentHash: hashContent(JSON.stringify({ metric, value: valueNum })),
            timestamp: new Date().toISOString(),
            retrievalMethod: "structured" as RetrievalMethod,
          },
          structuredData: {
            metric: "",
            period: "",
            value: valueNum,
            changePct,
            table: "structured_query",
            query: `Structured query for ${metric}`,
          },
        };
        
        allEvidence.push(evidence);
      }
    }
    
    queryCount++;
}

  return {
    evidence: allEvidence,
    latencyMs: Date.now() - startTime,
    queryCount,
  };
}