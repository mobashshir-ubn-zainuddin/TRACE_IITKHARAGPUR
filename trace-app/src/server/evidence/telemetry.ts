/**
 * Module 4: Telemetry
 * 
 * Records runtime metrics for Module 4 operations.
 * 
 * LLM telemetry should exist only if an LLM is actually used.
 */

import type { RetrievalTelemetry } from "./types";

export interface TelemetryEvent {
  eventType: string;
  timestamp: string;
  analysisId?: string;
  hypothesisId?: string;
  module: "evidence";
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export interface TelemetrySummary {
  totalRetrievals: number;
  totalEmbeddings: number;
  totalLLMCalls: number;
  avgRetrievalLatencyMs: number;
  avgEmbeddingLatencyMs: number;
  avgLLMLatencyMs: number;
  cacheHitRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  evidenceStats: {
    totalEvidence: number;
    supportCount: number;
    contradictCount: number;
    neutralCount: number;
    avgEvidenceScore: number;
  };
}

/** In-memory telemetry store (in production, use persistent storage) */
const telemetryEvents: TelemetryEvent[] = [];
const MAX_EVENTS = 10000;

/** Record a telemetry event */
export function recordTelemetry(event: Omit<TelemetryEvent, "timestamp" | "module">): void {
  const fullEvent: TelemetryEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    module: "evidence",
    metadata: event.metadata || {},
  };
  
  telemetryEvents.push(fullEvent);
  
  // Trim if too large
  if (telemetryEvents.length > MAX_EVENTS) {
    telemetryEvents.splice(0, telemetryEvents.length - MAX_EVENTS);
  }
}

/** Record retrieval telemetry */
export function recordRetrievalTelemetry(
  telemetry: RetrievalTelemetry,
  analysisId: string
): void {
  recordTelemetry({
    eventType: "retrieval_complete",
    analysisId,
    durationMs: telemetry.totalLatencyMs,
    metadata: {
      keywordCandidateCount: telemetry.keywordCandidateCount,
      vectorCandidateCount: telemetry.vectorCandidateCount,
      mergedCandidateCount: telemetry.mergedCandidateCount,
      rerankedCount: telemetry.rerankedCount,
      topK: telemetry.topK,
      keywordLatencyMs: telemetry.keywordLatencyMs,
      vectorLatencyMs: telemetry.vectorLatencyMs,
      rerankingLatencyMs: telemetry.rerankingLatencyMs,
      embeddingCacheHit: telemetry.embeddingCacheHit,
      embeddingCacheMiss: telemetry.embeddingCacheMiss,
      supportCount: telemetry.supportCount,
      contradictionCount: telemetry.contradictionCount,
      neutralCount: telemetry.neutralCount,
      evidenceGapCount: telemetry.evidenceGapCount,
    },
  });
}

/** Record embedding telemetry */
export function recordEmbeddingTelemetry(
  hypothesisId: string,
  analysisId: string,
  textCount: number,
  latencyMs: number,
  fromCache: boolean,
  model: string,
  dimension: number
): void {
  recordTelemetry({
    eventType: "embedding_generated",
    analysisId,
    hypothesisId,
    durationMs: latencyMs,
    metadata: {
      textCount,
      fromCache,
      model,
      dimension,
    },
  });
}

/** Record LLM telemetry (only if LLM is used) */
export function recordLLMTelemetry(
  hypothesisId: string,
  analysisId: string,
  operation: "classification" | "query_expansion" | "summarization",
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  model: string,
  estimatedCost: number
): void {
  recordTelemetry({
    eventType: "llm_call",
    analysisId,
    hypothesisId,
    durationMs: latencyMs,
    metadata: {
      operation,
      inputTokens,
      outputTokens,
      model,
      estimatedCost,
    },
  });
}

/** Record evidence scoring telemetry */
export function recordScoringTelemetry(
  hypothesisId: string,
  analysisId: string,
  evidenceCount: number,
  supportCount: number,
  contradictCount: number,
  neutralCount: number,
  avgScore: number,
  latencyMs: number
): void {
  recordTelemetry({
    eventType: "evidence_scored",
    analysisId,
    hypothesisId,
    durationMs: latencyMs,
    metadata: {
      evidenceCount,
      supportCount,
      contradictCount,
      neutralCount,
      avgScore,
    },
  });
}

/** Record contradiction detection telemetry */
export function recordContradictionTelemetry(
  hypothesisId: string,
  analysisId: string,
  contradictionCount: number,
  maxSeverity: "low" | "medium" | "high",
  latencyMs: number
): void {
  recordTelemetry({
    eventType: "contradiction_detected",
    analysisId,
    hypothesisId,
    durationMs: latencyMs,
    metadata: {
      contradictionCount,
      maxSeverity,
    },
  });
}

/** Get telemetry summary */
export function getTelemetrySummary(analysisId?: string): TelemetrySummary {
  const events = analysisId 
    ? telemetryEvents.filter(e => e.analysisId === analysisId)
    : telemetryEvents;
  
  const retrievalEvents = events.filter(e => e.eventType === "retrieval_complete");
  const embeddingEvents = events.filter(e => e.eventType === "embedding_generated");
  const llmEvents = events.filter(e => e.eventType === "llm_call");
  const scoringEvents = events.filter(e => e.eventType === "evidence_scored");
  
  const totalRetrievals = retrievalEvents.length;
  const totalEmbeddings = embeddingEvents.reduce((sum, e) => sum + (e.metadata.textCount as number), 0);
  const totalLLMCalls = llmEvents.length;
  
  const avgRetrievalLatencyMs = retrievalEvents.length > 0
    ? retrievalEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0) / retrievalEvents.length
    : 0;
  
  const avgEmbeddingLatencyMs = embeddingEvents.length > 0
    ? embeddingEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0) / embeddingEvents.length
    : 0;
  
  const avgLLMLatencyMs = llmEvents.length > 0
    ? llmEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0) / llmEvents.length
    : 0;
  
  // Calculate cache hit rate
  const cacheHits = embeddingEvents.filter(e => e.metadata.fromCache === true).length;
  const cacheMisses = embeddingEvents.filter(e => e.metadata.fromCache === false).length;
  const cacheHitRate = (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;
  
  // Token and cost totals
  const totalInputTokens = llmEvents.reduce((sum, e) => sum + (e.metadata.inputTokens as number), 0);
  const totalOutputTokens = llmEvents.reduce((sum, e) => sum + (e.metadata.outputTokens as number), 0);
  const estimatedCost = llmEvents.reduce((sum, e) => sum + (e.metadata.estimatedCost as number), 0);
  
  // Evidence stats
  const totalEvidence = scoringEvents.reduce((sum, e) => sum + (e.metadata.evidenceCount as number), 0);
  const supportCount = scoringEvents.reduce((sum, e) => sum + (e.metadata.supportCount as number), 0);
  const contradictCount = scoringEvents.reduce((sum, e) => sum + (e.metadata.contradictCount as number), 0);
  const neutralCount = scoringEvents.reduce((sum, e) => sum + (e.metadata.neutralCount as number), 0);
  const avgEvidenceScore = scoringEvents.length > 0
    ? scoringEvents.reduce((sum, e) => sum + (e.metadata.avgScore as number), 0) / scoringEvents.length
    : 0;
  
  return {
    totalRetrievals,
    totalEmbeddings,
    totalLLMCalls,
    avgRetrievalLatencyMs: Math.round(avgRetrievalLatencyMs),
    avgEmbeddingLatencyMs: Math.round(avgEmbeddingLatencyMs),
    avgLLMLatencyMs: Math.round(avgLLMLatencyMs),
    cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
    totalInputTokens,
    totalOutputTokens,
    estimatedCost: Math.round(estimatedCost * 1000000) / 1000000,
    evidenceStats: {
      totalEvidence,
      supportCount,
      contradictCount,
      neutralCount,
      avgEvidenceScore: Math.round(avgEvidenceScore * 10000) / 10000,
    },
  };
}

/** Get telemetry events for an analysis */
export function getTelemetryEvents(analysisId: string): TelemetryEvent[] {
  return telemetryEvents.filter(e => e.analysisId === analysisId);
}

/** Clear telemetry */
export function clearTelemetry(): void {
  telemetryEvents.length = 0;
}

/** Export telemetry as JSON for external monitoring */
export function exportTelemetry(analysisId?: string): string {
  const events = analysisId 
    ? telemetryEvents.filter(e => e.analysisId === analysisId)
    : telemetryEvents;
  return JSON.stringify(events, null, 2);
}