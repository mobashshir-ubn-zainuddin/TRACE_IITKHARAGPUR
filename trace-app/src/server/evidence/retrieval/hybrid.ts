/**
 * Module 4: Hybrid Retrieval
 * 
 * Combines keyword and vector retrieval with metadata filtering.
 * Pipeline: EvidenceRequest → Query Builder → Metadata Filter → Keyword + Vector → Merge → Rerank → Top-K
 */

import { keywordSearch, type KeywordResult, keywordResultToEvidenceItem, hashContent, classifyDirection, escapeRegExp } from "./keyword";
import { vectorSearch, type VectorResult, vectorResultToEvidenceItem } from "./vector";
import { structuredSearch, type StructuredSearchResult } from "./structured";
import { rerank } from "./reranker";
import { buildQueries } from "../queryBuilder";
import type { EvidenceRequest, EvidenceItem, EvidenceSourceType, QueryBuilderOutput } from "../types";

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
      contentHash: hashContent(item.text),
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
  
  // Run structured, keyword and vector search in parallel
  const structuredStartTime = Date.now();
  const structuredResults = await structuredSearch(evidenceRequest);
  const structuredLatencyMs = Date.now() - structuredStartTime;
  
  const keywordStartTime = Date.now();
  const keywordResults = await keywordSearch({
    query: primaryQuery,
    filters,
    limit: keywordLimit,
    minScore: minKeywordScore,
  });
  const keywordLatencyMs = Date.now() - keywordStartTime;
  
  const vectorStartTime = Date.now();
  const vectorResults = await vectorSearch({
    query: primaryQuery,
    filters,
    limit: vectorLimit,
    minSimilarity: minVectorSimilarity,
  });
  const vectorLatencyMs = Date.now() - vectorStartTime;
  
  // Merge structured results with keyword and vector results
  const structuredEvidence = structuredResults.evidence;
  const keywordEvidence = keywordResults;
  const vectorEvidence = vectorResults;
  
  // For now, convert structured evidence to a format compatible with merging
  // In a full implementation, we would have a unified merging strategy
  const allEvidence = [
    ...structuredEvidence,
    ...keywordResults,
    ...vectorResults
  ];
  
  // Convert to EvidenceItems
  let evidenceItems = allEvidence.map((item, index) => {
    if ('similarity' in item) {
      // VectorResult
      return vectorResultToEvidenceItem(item, evidenceRequest.hypothesisId, evidenceRequest.driver, expectedDirection);
    } else if ('score' in item) {
      // KeywordResult
      return keywordResultToEvidenceItem(item, evidenceRequest.hypothesisId, evidenceRequest.driver, expectedDirection);
    } else {
      // Structured result - already an EvidenceItem
      return {
        ...item,
        hypothesisId: evidenceRequest.hypothesisId,
        driver: evidenceRequest.driver,
      };
    }
  });
  
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
      vectorCandidateCount: vectorResults.length,
      structuredCandidateCount: structuredResults.evidence.length,
      mergedCandidateCount: structuredResults.evidence.length + keywordResults.length + vectorResults.length,
      rerankedCount: evidenceItems.length,
      finalCount: evidenceItems.length,
      keywordLatencyMs,
      vectorLatencyMs,
      structuredLatencyMs,
      rerankingLatencyMs,
      totalLatencyMs: Date.now() - startTime,
      retrievalLatencyMs: totalLatencyMs,
      embeddingLatencyMs: 0, // Will be populated by embedding service
      topK: finalLimit,
      embeddingCacheHit: false,
      embeddingCacheMiss: false,
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