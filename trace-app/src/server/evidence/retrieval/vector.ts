/**
 * Module 4: Vector Retrieval
 * 
 * Semantic similarity search using embeddings with metadata filtering.
 * Falls back gracefully if embedding provider is unavailable.
 */

import { getDB } from "../../db";
import { getEmbeddingService } from "../embeddings";
import type { EvidenceSourceType, EvidenceItem, Provenance } from "../types";
import { cosineSimilarity } from "./reranker";
import { classifyDirection } from "./keyword";
import { generateContentHash } from "../embeddings/provider";

export interface VectorSearchOptions {
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
  minSimilarity?: number;
  model?: string;
}

export interface VectorResult {
  chunkId: number;
  documentId: number;
  text: string;
  similarity: number;
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
    embeddingModel: string;
  };
}

export interface VectorSearchTelemetry {
  embeddingLatencyMs: number;
  embeddingCacheHit: boolean;
  embeddingCacheMiss: boolean;
}

/** Search document chunks using vector similarity */
export async function vectorSearch(options: VectorSearchOptions): Promise<{ results: VectorResult[]; telemetry: VectorSearchTelemetry }> {
  const { 
    query, 
    filters = {}, 
    limit = 20, 
    minSimilarity = 0.5,
    model 
  } = options;
  
  const db = await getDB();
  const embeddingService = getEmbeddingService();
  
  // Generate query embedding
  const { embedding: queryEmbedding, fromCache, latencyMs } = await embeddingService.embedQuery(query);
  
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
  
  // Add provider/model/dimension filter to ensure compatible embeddings
  conditions.push("e.provider = ?");
  params.push("gemini");
  conditions.push("e.model = ?");
  params.push("gemini-embedding-001");
  conditions.push("e.dimension = ?");
  params.push(768);
  
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
      d.document_date,
      e.embedding,
      e.provider as embedding_provider,
      e.model as embedding_model
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    JOIN embeddings e ON dc.id = e.chunk_id
    ${whereClause}
    ORDER BY d.authority_score DESC
    LIMIT ?
  `;
  
  params.push(limit * 5); // Fetch more for similarity scoring
  
  const rows = await getDB().then(db => db.all(sql, ...params));
  
  if (rows.length === 0) {
    return { results: [], telemetry: { embeddingLatencyMs: latencyMs, embeddingCacheHit: fromCache, embeddingCacheMiss: !fromCache } };
  }
  
  // Parse embeddings and calculate similarities
  const scored = rows.map(row => {
    let chunkEmbedding: number[] = [];
    try {
      chunkEmbedding = JSON.parse(row.embedding);
    } catch {
      return { ...row, similarity: 0 };
    }
    
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return { ...row, similarity };
  });
  
  // Filter by minimum similarity and sort
  const results = scored
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  const results_mapped = results.map(r => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    text: r.text,
    similarity: r.similarity,
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
      embeddingModel: r.embedding_provider + "/" + r.embedding_model,
    },
  }));
  
  return { 
    results: results_mapped, 
    telemetry: { embeddingLatencyMs: latencyMs, embeddingCacheHit: fromCache, embeddingCacheMiss: !fromCache } 
  };
}

/** Convert vector result to EvidenceItem */
export function vectorResultToEvidenceItem(
  result: VectorResult,
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
    retrievalMethod: "vector",
    embeddingModel: result.metadata.embeddingModel,
    contentHash: generateContentHash(result.text),
    timestamp: new Date().toISOString(),
  };
  
  // Direction classification
  const direction = classifyDirection(result.text, expectedDirection);
  
  return {
    id: `vec-${result.chunkId}-${hypothesisId}`,
    hypothesisId,
    driver,
    text: result.text,
    direction,
    semanticRelevance: result.similarity,
    sourceQuality: result.metadata.authorityScore,
    temporalRelevance: 0.5, // Will be calculated properly in scoring
    entityRelevance: 0.5,
    hypothesisAlignment: direction === "support" ? 0.8 : direction === "contradict" ? 0.2 : 0.5,
    evidenceScore: 0, // Will be calculated in scoring
    provenance,
  };
}