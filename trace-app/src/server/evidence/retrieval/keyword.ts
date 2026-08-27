/**
 * Module 4: Keyword Retrieval
 * 
 * BM25-style keyword search over document chunks with metadata filtering.
 * Must remain functional even if embedding provider is unavailable.
 */

import { getDB } from "../../db";
import { generateContentHash } from "../embeddings/provider";
import type { EvidenceSourceType, EvidenceItem, Provenance } from "../types";

export interface KeywordSearchOptions {
  query: string;
  filters?: {
    region?: string;
    product?: string;
    dateStart?: string;
    dateEnd?: string;
    sourceType?: EvidenceSourceType[];
    documentType?: string[];
    topic?: string[];
  };
  limit?: number;
  minScore?: number;
}

export interface KeywordResult {
  chunkId: number;
  documentId: number;
  text: string;
  score: number;
  metadata: {
    region?: string;
    product?: string;
    dateStart?: string;
    dateEnd?: string;
    source: string;
    sourceType: EvidenceSourceType;
    documentType?: string;
    topic?: string;
    authorityScore: number;
    documentDate: string;
    chunkIndex: number;
  };
}

/** Simple BM25-inspired scoring */
function calculateKeywordScore(
  query: string,
  text: string,
  authorityScore: number
): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const textLower = text.toLowerCase();
  
  if (queryTerms.length === 0) return 0;
  
  let score = 0;
  for (const term of queryTerms) {
    // Count occurrences
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    const matches = textLower.match(regex);
    const tf = matches ? matches.length : 0;
    
    if (tf > 0) {
      // Simple TF * authority weighting
      score += tf * Math.log(1 + authorityScore * 10);
    }
  }
  
  // Normalize by text length (rough)
  const lengthNorm = Math.log(1 + text.length / 100);
  return score / (1 + lengthNorm);
}

  /** Search document chunks using keyword matching */
export async function keywordSearch(options: KeywordSearchOptions): Promise<KeywordResult[]> {
  const { query, filters = {}, limit = 20, minScore = 0.1 } = options;
  const db = await getDB();
  
  // Build metadata filter conditions
  const conditions: string[] = [];
  const params: unknown[] = [];
  
  if (filters.region) {
    conditions.push("dc.region = ?");
    params.push(filters.region);
  }
  if (filters.product) {
    conditions.push("dc.product = ?");
    params.push(filters.product);
  }
  if (filters.dateStart) {
    conditions.push("dc.date_end >= ?");
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    conditions.push("dc.date_start <= ?");
    params.push(filters.dateEnd);
  }
  if (filters.sourceType && filters.sourceType.length > 0) {
    const placeholders = filters.sourceType.map(() => "?").join(",");
    conditions.push(`d.document_type IN (${placeholders})`);
    params.push(...filters.sourceType);
  }
  if (filters.documentType && filters.documentType.length > 0) {
    const placeholders = filters.documentType.map(() => "?").join(",");
    conditions.push(`d.document_type IN (${placeholders})`);
    params.push(...filters.documentType);
  }
  if (filters.topic && filters.topic.length > 0) {
    const placeholders = filters.topic.map(() => "?").join(",");
    conditions.push(`d.topic IN (${placeholders})`);
    params.push(...filters.topic);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  
  const sql = `
    SELECT 
      dc.id as chunk_id,
      dc.document_id,
      dc.text,
      dc.chunk_index,
      dc.region,
      dc.product,
      dc.date_start,
      dc.date_end,
      d.source,
      d.document_type,
      d.topic,
      d.authority_score,
      d.document_date
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    ${whereClause}
    ORDER BY d.authority_score DESC, dc.chunk_index
    LIMIT ?
  `;
  
  params.push(limit * 3); // Fetch more for scoring
  
  const rows = await getDB().then(db => db.all(sql, ...params));
  
  // Score each result
  const scored = rows.map(row => {
    const score = calculateKeywordScore(query, row.text, row.authority_score);
    return { ...row, score };
  });
  
  // Filter by minimum score and sort
  const results = scored
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return results.map(r => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    text: r.text,
    score: r.score,
    metadata: {
      region: r.region,
      product: r.product,
      dateStart: r.date_start,
      dateEnd: r.date_end,
      source: r.source,
      sourceType: r.document_type as EvidenceSourceType,
      documentType: r.document_type,
      topic: r.topic,
      authorityScore: r.authority_score,
      documentDate: r.document_date,
      chunkIndex: r.chunk_index,
    },
  }));
}

/** Convert keyword result to EvidenceItem */
export function keywordResultToEvidenceItem(
  result: KeywordResult,
  hypothesisId: string,
  driver: string,
  expectedDirection: "positive" | "negative"
): EvidenceItem {
  const provenance: Provenance = {
    source: result.metadata.source,
    sourceType: result.metadata.sourceType,
    documentId: result.documentId,
    chunkId: result.chunkId,
    region: result.metadata.region,
    product: result.metadata.product,
    dateStart: result.metadata.dateStart,
    dateEnd: result.metadata.dateEnd,
    retrievalMethod: "keyword",
    contentHash: generateContentHash(result.text),
    timestamp: new Date().toISOString(),
  };
  
  // Simple direction classification based on text content
  const direction = classifyDirection(result.text, expectedDirection);
  
  return {
    id: `kw-${result.chunkId}-${hypothesisId}`,
    hypothesisId,
    driver,
    text: result.text,
    direction,
    semanticRelevance: Math.min(result.score, 1),
    sourceQuality: result.metadata.authorityScore,
    temporalRelevance: 0.5, // Will be calculated properly in scoring
    entityRelevance: 0.5,
    hypothesisAlignment: direction === "support" ? 0.8 : direction === "contradict" ? 0.2 : 0.5,
    evidenceScore: 0, // Will be calculated in scoring
    provenance,
  };
}

/** Basic direction classification */
export function classifyDirection(
  text: string,
  expectedDirection: "positive" | "negative"
): "support" | "contradict" | "neutral" {
  const textLower = text.toLowerCase();
  
  // Positive indicators
  const positiveTerms = [
    "increase", "increased", "increasing", "growth", "grew", "improve", "improved", "improving",
    "recovery", "recovered", "recovering", "up", "higher", "better", "positive", "gain", "gains",
    "rise", "rose", "rising", "boost", "boosted", "strengthen", "strengthened",
    "availability improved", "stockout decreased", "stockout rate down", "stockout rate dropped",
    "inventory improved", "fill rate improved", "on-time improved",
    "conversion improved", "conversion up", "conversion increased",
    "revenue up", "revenue growth", "sales up", "orders up",
  ];
  
  // Negative indicators
  const negativeTerms = [
    "decrease", "decreased", "decreasing", "decline", "declined", "declining",
    "drop", "dropped", "dropping", "fall", "fell", "falling",
    "worse", "negative", "loss", "losses", "down", "lower", "reduce", "reduced",
    "deteriorate", "deteriorated", "deteriorating", "weaken", "weakened",
    "stockout increased", "stockout rate up", "stockout rate rose", "stockout rate climbed",
    "availability down", "availability decreased", "availability dropped",
    "out of stock", "unavailable", "shortage", "stockout", "stockouts",
    "delay", "delayed", "delays", "late", "behind schedule",
    "conversion down", "conversion dropped", "conversion fell",
    "revenue down", "revenue decline", "revenue dropped", "sales down", "orders down",
    "cancelled", "cancellation", "churn", "lost",
  ];
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const term of positiveTerms) {
    if (textLower.includes(term)) positiveScore++;
  }
  for (const term of negativeTerms) {
    if (textLower.includes(term)) negativeScore++;
  }
  
  if (positiveScore > negativeScore) {
    return expectedDirection === "positive" ? "support" : "contradict";
  } else if (negativeScore > positiveScore) {
    return expectedDirection === "negative" ? "support" : "contradict";
  }
  return "neutral";
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}