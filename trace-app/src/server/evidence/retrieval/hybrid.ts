/**
 * Module 4: Hybrid Retrieval
 * 
 * Combines keyword and vector retrieval with metadata filtering.
 * Pipeline: EvidenceRequest → Query Builder → Metadata Filter → Keyword + Vector → Merge → Rerank → Top-K
 */

import { keywordSearch, type KeywordResult, keywordResultToEvidenceItem, classifyDirection, escapeRegExp } from "./keyword";
import { vectorSearch, type VectorResult, vectorResultToEvidenceItem, type VectorSearchTelemetry } from "./vector";
import { structuredSearch, type StructuredSearchResult } from "./structured";
import { rerank } from "./reranker";
import { buildQueries } from "../queryBuilder";
import type { EvidenceRequest, EvidenceItem, EvidenceSourceType, QueryBuilderOutput } from "../types";
import { generateContentHash } from "../embeddings/provider";

export interface HybridSearchOptions {
  evidenceRequest: EvidenceRequest;
  expectedDirection: "positive" | "negative";
  keywordLimit?: number;
  vectorLimit?: number;
  finalLimit?: number;
  minKeywordScore?: number;
  minVectorSimilarity?: number;
  enableReranking?: boolean;
}

export interface HybridSearchResult {
  evidence: EvidenceItem[];
  telemetry: {
    keywordCandidateCount: number;
    vectorCandidateCount: number;
    structuredCandidateCount: number;
    mergedCandidateCount: number;
    rerankedCount: number;
    finalCount: number;
    keywordLatencyMs: number;
    vectorLatencyMs: number;
    structuredLatencyMs: number;
    rerankingLatencyMs: number;
    totalLatencyMs: number;
    retrievalLatencyMs: number;
    embeddingLatencyMs: number;
    topK: number;
    embeddingCacheHit: boolean;
    embeddingCacheMiss: boolean;
    vectorUnavailable: boolean;
  };
  queryBuilderOutput: QueryBuilderOutput;
}

/** Merge keyword and vector results, deduplicating by chunkId */
function mergeResults(
  keywordResults: KeywordResult[],
  vectorResults: VectorResult[]
): Array<{ item: KeywordResult | VectorResult; keywordScore?: number; vectorScore?: number; source: "keyword" | "vector" | "both" }> {
  const merged = new Map<number, { 
    item: KeywordResult | VectorResult; 
    keywordScore?: number; 
    vectorScore?: number;
    source: "keyword" | "vector" | "both";
  }>();
  
  // Add keyword results
  for (const r of keywordResults) {
    merged.set(r.chunkId, { item: r, keywordScore: r.score, source: "keyword" });
  }
  
  // Add/merge vector results
  for (const r of vectorResults) {
    const existing = merged.get(r.chunkId);
    if (existing) {
      existing.vectorScore = r.similarity;
      existing.source = "both";
    } else {
      merged.set(r.chunkId, { item: r, vectorScore: r.similarity, source: "vector" });
    }
  }
  
  return Array.from(merged.values());
}

/** Convert merged results to EvidenceItems */
function mergedToEvidenceItems(
  merged: Array<{ item: KeywordResult | VectorResult; keywordScore?: number; vectorScore?: number; source: "keyword" | "vector" | "both" }>,
  hypothesisId: string,
  driver: string,
  expectedDirection: "positive" | "negative"
): EvidenceItem[] {
  return merged.map(m => {
    const item = m.item;
    const isKeyword = "score" in item;
    const isVector = "similarity" in item;
    
    const provenance = {
      source: item.metadata.source,
      sourceType: item.metadata.sourceType,
      documentId: item.documentId,
      chunkId: item.chunkId,
      region: item.metadata.region,
      product: item.metadata.product,
      dateStart: item.metadata.dateStart,
      dateEnd: item.metadata.dateEnd,
      retrievalMethod: m.source === "both" ? "hybrid" : m.source,
      embeddingModel: isVector ? item.metadata.embeddingModel : undefined,
      contentHash: generateContentHash(item.text),
      timestamp: new Date().toISOString(),
    } as const;
    
    // Use best available score for semantic relevance
    const semanticRelevance = isVector ? item.similarity : (isKeyword ? Math.min(item.score, 1) : 0);
    
    // Direction classification using text
    const direction = classifyDirection(item.text, expectedDirection);
    
    // Hypothesis alignment based on direction
    const hypothesisAlignment = direction === "support" ? 0.8 : direction === "contradict" ? 0.2 : 0.5;
    
    return {
      id: `${m.source}-${item.chunkId}-${hypothesisId}`,
      hypothesisId,
      driver,
      text: item.text,
      direction,
      semanticRelevance,
      sourceQuality: item.metadata.authorityScore,
      temporalRelevance: 0.5,
      entityRelevance: 0.5,
      hypothesisAlignment,
      evidenceScore: 0,
      provenance,
    };
  });
}

/** Main hybrid search function */
export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult> {
  const startTime = Date.now();
  const {
    evidenceRequest,
    expectedDirection,
    keywordLimit = 30,
    vectorLimit = 30,
    finalLimit = 10,
    minKeywordScore = 0.1,
    minVectorSimilarity = 0.5,
    enableReranking = true,
  } = options;
  
  // Build queries using query builder
  const queryBuilderOutput = await buildQueries({ evidenceRequest });
  
  // Use the first unstructured query for retrieval (could be enhanced to use multiple)
  const primaryQuery = queryBuilderOutput.unstructuredQueries[0]?.query || 
    `${evidenceRequest.driver} ${evidenceRequest.filters.region || ""} ${evidenceRequest.period}`.trim();
  
  const filters = {
    region: evidenceRequest.filters.region,
    product: evidenceRequest.filters.product,
    dateStart: evidenceRequest.filters.dateStart,
    dateEnd: evidenceRequest.filters.dateEnd,
    sourceType: queryBuilderOutput.unstructuredQueries[0]?.filters.sourceType,
  };
  
  // Run structured, keyword and vector search in parallel with graceful error handling
  const structuredStartTime = Date.now();
  const structuredPromise = structuredSearch(evidenceRequest).catch(err => {
    console.warn("Structured search failed:", err);
    return { evidence: [], latencyMs: 0, queryCount: 0 } as StructuredSearchResult;
  });
  
  const keywordStartTime = Date.now();
  const keywordPromise = keywordSearch({
    query: primaryQuery,
    filters,
    limit: keywordLimit,
    minScore: minKeywordScore,
  }).catch(err => {
    console.warn("Keyword search failed:", err);
    return [];
  });
  
  const vectorStartTime = Date.now();
  const vectorPromise = vectorSearch({
    query: primaryQuery,
    filters,
    limit: vectorLimit,
    minSimilarity: minVectorSimilarity,
  }).catch(err => {
    console.warn("Vector search failed:", err);
    return { 
      results: [], 
      telemetry: { 
        embeddingLatencyMs: 0, 
        embeddingCacheHit: false, 
        embeddingCacheMiss: false,
        vectorUnavailable: true
      } 
    };
  });
  
  const [structuredResults, keywordResults, vectorResults] = await Promise.all([
    structuredPromise,
    keywordPromise,
    vectorPromise,
  ]);
  
  const structuredLatencyMs = Date.now() - structuredStartTime;
  const keywordLatencyMs = Date.now() - keywordStartTime;
  const vectorLatencyMs = Date.now() - vectorStartTime;
  
  // Extract vector telemetry
  const { results: vectorResultsData, telemetry: vectorTelemetry } = vectorResults;
  
  // Track if vector search was unavailable
  const vectorUnavailable = vectorTelemetry?.vectorUnavailable === true;
  
  // Merge keyword and vector results using mergeResults
  const merged = mergeResults(keywordResults, vectorResultsData);
  
// Convert merged results to EvidenceItems
  let evidenceItems = mergedToEvidenceItems(merged, evidenceRequest.hypothesisId, evidenceRequest.driver, expectedDirection);
  
  // Add structured evidence
  const structuredEvidence = structuredResults.evidence.map(item => ({
    ...item,
    hypothesisId: evidenceRequest.hypothesisId,
    driver: evidenceRequest.driver,
  }));
  evidenceItems = [...structuredEvidence, ...evidenceItems];
  
  // Rerank if enabled
  let rerankingLatencyMs = 0;
  if (enableReranking && evidenceItems.length > 1) {
    const rerankStartTime = Date.now();
    evidenceItems = await rerank(evidenceItems, evidenceRequest, expectedDirection);
    rerankingLatencyMs = Date.now() - rerankStartTime;
  }
  
  // Take top-K
  evidenceItems = evidenceItems.slice(0, finalLimit);
  
  const totalLatencyMs = Date.now() - startTime;
  
  return {
    evidence: evidenceItems,
    telemetry: {
      keywordCandidateCount: keywordResults.length,
      vectorCandidateCount: vectorResultsData.length,
      structuredCandidateCount: structuredResults.evidence.length,
      mergedCandidateCount: merged.length + structuredResults.evidence.length,
      rerankedCount: evidenceItems.length,
      finalCount: evidenceItems.length,
      keywordLatencyMs,
      vectorLatencyMs,
      structuredLatencyMs,
      rerankingLatencyMs,
      totalLatencyMs: Date.now() - startTime,
      retrievalLatencyMs: totalLatencyMs,
      embeddingLatencyMs: vectorTelemetry.embeddingLatencyMs,
      topK: finalLimit,
      embeddingCacheHit: vectorTelemetry.embeddingCacheHit,
      embeddingCacheMiss: vectorTelemetry.embeddingCacheMiss,
      vectorUnavailable,
    },
    queryBuilderOutput,
  };
}

/** Search for multiple hypotheses in parallel */
export async function hybridSearchMultiple(
  requests: Array<{ evidenceRequest: EvidenceRequest; expectedDirection: "positive" | "negative" }>,
  options?: Partial<HybridSearchOptions>
): Promise<HybridSearchResult[]> {
  return Promise.all(
    requests.map(req => hybridSearch({ ...options, ...req }))
  );
}