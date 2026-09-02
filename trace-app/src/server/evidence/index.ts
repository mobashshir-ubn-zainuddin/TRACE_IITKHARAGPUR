/**
 * Module 4: Evidence + RAG - Main Orchestrator
 * 
 * Entry point for Module 4. Coordinates:
 * - Query building
 * - Hybrid retrieval (structured + unstructured)
 * - Evidence scoring
 * - Contradiction detection
 * - Confidence updating
 * - Provenance tracking
 * - Graph generation
 * - Telemetry
 */

import { hybridSearch, structuredSearch, type HybridSearchResult, type StructuredSearchResult } from "./retrieval";
import { calculateHypothesisAggregateScores, calculateEvidenceScore, type HypothesisAggregateScores } from "./scoring";
import { detectEvidenceContradictions } from "./contradiction";
import { updateHypothesisConfidence, determineHypothesisStatus, generateConfidenceExplanation, type ConfidenceUpdateResult } from "./confidence";
import { validateProvenance, enrichProvenance, generateProvenanceSummary, verifyEvidenceChain, type Provenance } from "./provenance";
import { generateEvidenceGraph, type EvidenceGraphData } from "./graph";
import { recordRetrievalTelemetry, recordScoringTelemetry, recordContradictionTelemetry, getTelemetrySummary } from "./telemetry";
import { seedSyntheticEvidence } from "./syntheticEvidence";
import type { 
  EvidenceRequest, 
  EvidenceItem, 
  EvidenceHypothesis, 
  EvidencePackage, 
  EvidenceGap,
  EvidenceContradiction,
  RetrievalTelemetry,
  EvidenceDirection,
} from "./types";
import { DEFAULT_EVIDENCE_SCORING_CONFIG } from "./types";

export interface AnalyzeEvidenceOptions {
  analysisId: string;
  evidenceRequests: EvidenceRequest[];
  m3Hypotheses: Array<{
    hypothesisId: string;
    driver: string;
    name: string;
    expectedDirection: "positive" | "negative";
    priorConfidence: number;
  }>;
  config?: typeof DEFAULT_EVIDENCE_SCORING_CONFIG;
}

export interface AnalyzeEvidenceResult {
  evidencePackage: EvidencePackage;
  graphData: EvidenceGraphData;
  telemetry: RetrievalTelemetry;
  confidenceUpdates: ConfidenceUpdateResult[];
  provenanceSummary: ReturnType<typeof generateProvenanceSummary>;
}

/** Main evidence analysis function */
export async function analyzeEvidence(options: AnalyzeEvidenceOptions): Promise<AnalyzeEvidenceResult> {
  const { analysisId, evidenceRequests, m3Hypotheses, config = DEFAULT_EVIDENCE_SCORING_CONFIG } = options;
  const startTime = Date.now();
  
  // Map hypotheses by ID for easy lookup
  const hypothesisMap = new Map(m3Hypotheses.map(h => [h.hypothesisId, h]));
  
  // Process each evidence request in parallel
  const results = await Promise.all(
    evidenceRequests.map(async (request) => {
      const m3Hypothesis = hypothesisMap.get(request.hypothesisId);
      if (!m3Hypothesis) {
        throw new Error(`M3 hypothesis not found for ${request.hypothesisId}`);
      }
      
      const result = await hybridSearch({
        evidenceRequest: request,
        expectedDirection: m3Hypothesis.expectedDirection,
        finalLimit: 10,
      });
      
      // Score evidence items
      const scoredEvidence = result.evidence.map(item => {
        // Calculate component scores
        const breakdown = calculateEvidenceScore(item, request, m3Hypothesis.expectedDirection, config);
        return { ...item, evidenceScore: breakdown.finalScore, scoreBreakdown: breakdown };
      });
      
      return {
        hypothesisId: request.hypothesisId,
        evidence: scoredEvidence,
        telemetry: result.telemetry,
      };
    })
  );
  
  // Aggregate results.
  //
  // ROOT CAUSE (evidenceCount vs linked-evidence mismatch, and evidence
  // silently missing its supporting/contradicting/neutral classification):
  // generateEvidenceRequests() intentionally issues ONE evidence request PER
  // CANDIDATE LEVER of a driver (e.g. "orders" has 3 levers -> 3 requests, all
  // sharing hypothesisId "Horders"; "aov" has 4 levers -> 4 requests). Each
  // request retrieves up to 10 items. The previous code did
  // `hypothesisEvidenceMap.set(result.hypothesisId, result.evidence)` inside
  // the per-result loop below, which OVERWRITES the map entry every time a
  // later lever's request for the same hypothesis is processed - so only the
  // LAST lever's ~10 items ever became "the hypothesis's evidence" (used for
  // evidenceCount, supporting/contradicting/neutral, confidence and
  // contradiction detection), while `allEvidence` kept every lever's items
  // (3x/4x more), which is exactly the "evidenceCount (10) vs linked evidence
  // (30/40)" mismatch and the "not categorized" evidence. It also meant the
  // contradiction/support classification for a hypothesis was decided from an
  // arbitrary 1-of-N lever slice instead of its full retrieved evidence pool.
  //
  // Fix: merge (not overwrite) evidence across every request for the same
  // hypothesisId, and dedupe by evidence id - ids already encode
  // `${method}-${chunkId}-${hypothesisId}` (see retrieval/*.ts), so the same
  // id can only recur when two lever queries retrieved the identical chunk
  // for the identical hypothesis; it never collides across hypotheses.
  const dedupedEvidenceById = new Map<string, EvidenceItem>();
  const hypothesisEvidenceMap = new Map<string, EvidenceItem[]>();
  const totalTelemetry: RetrievalTelemetry = {
    retrievalLatencyMs: 0,
    embeddingLatencyMs: 0,
    rerankingLatencyMs: 0,
    scoringLatencyMs: 0,
    structuredLatencyMs: 0,
    keywordLatencyMs: 0,
    vectorLatencyMs: 0,
    totalLatencyMs: 0,
    
    keywordCandidateCount: 0,
    vectorCandidateCount: 0,
    structuredCandidateCount: 0,
    mergedCandidateCount: 0,
    rerankedCount: 0,
    topK: 0,
    
    embeddingCacheHit: false,
    embeddingCacheMiss: false,
    
    supportCount: 0,
    contradictionCount: 0,
    neutralCount: 0,
    evidenceGapCount: 0,
    
    llmCalls: 0,
    llmInputTokens: 0,
    llmOutputTokens: 0,
    llmLatencyMs: 0,
    estimatedCost: 0,
  };
  
  // Process each hypothesis
  for (const result of results) {
    const existingForHyp = hypothesisEvidenceMap.get(result.hypothesisId) ?? [];
    const mergedForHyp = [...existingForHyp];
    for (const item of result.evidence) {
      if (!dedupedEvidenceById.has(item.id)) {
        dedupedEvidenceById.set(item.id, item);
      }
      if (!mergedForHyp.some((e) => e.id === item.id)) {
        mergedForHyp.push(item);
      }
    }
    hypothesisEvidenceMap.set(result.hypothesisId, mergedForHyp);

// Aggregate telemetry
  totalTelemetry.retrievalLatencyMs += result.telemetry.retrievalLatencyMs;
  totalTelemetry.embeddingLatencyMs += result.telemetry.embeddingLatencyMs;
  totalTelemetry.structuredLatencyMs += result.telemetry.structuredLatencyMs || 0;
  totalTelemetry.keywordLatencyMs += result.telemetry.keywordLatencyMs || 0;
  totalTelemetry.vectorLatencyMs += result.telemetry.vectorLatencyMs || 0;
  totalTelemetry.rerankingLatencyMs += result.telemetry.rerankingLatencyMs || 0;
  totalTelemetry.totalLatencyMs += result.telemetry.totalLatencyMs || 0;
  
  totalTelemetry.keywordCandidateCount += result.telemetry.keywordCandidateCount;
  totalTelemetry.vectorCandidateCount += result.telemetry.vectorCandidateCount;
  totalTelemetry.structuredCandidateCount += result.telemetry.structuredCandidateCount || 0;
  totalTelemetry.mergedCandidateCount += result.telemetry.mergedCandidateCount || 0;
  totalTelemetry.rerankedCount += result.telemetry.rerankedCount || 0;
  totalTelemetry.topK = Math.max(totalTelemetry.topK, result.telemetry.topK || 0);
  totalTelemetry.embeddingCacheHit = totalTelemetry.embeddingCacheHit || result.telemetry.embeddingCacheHit;
  totalTelemetry.embeddingCacheMiss = totalTelemetry.embeddingCacheMiss || result.telemetry.embeddingCacheMiss;
  }

  // The package-level evidence list is the deduped union built above, so it
  // always matches exactly what each hypothesis's merged bucket contains -
  // no more 3x/4x inflation from unmerged per-lever requests.
  const allEvidence: EvidenceItem[] = Array.from(dedupedEvidenceById.values());

  // Build evidence hypotheses with aggregate scores
  const evidenceHypotheses: EvidenceHypothesis[] = [];
  const allContradictions: EvidenceContradiction[] = [];
  const allEvidenceGaps: EvidenceGap[] = [];
  const confidenceUpdates: ConfidenceUpdateResult[] = [];
  
  for (const m3Hyp of m3Hypotheses) {
    const evidence = hypothesisEvidenceMap.get(m3Hyp.hypothesisId) || [];
    
    // Detect contradictions
    const contradictionResult = detectEvidenceContradictions(
      m3Hyp.hypothesisId,
      m3Hyp.driver,
      evidence
    );
    
    // Calculate aggregate scores
    const aggregate = calculateHypothesisAggregateScores(
      m3Hyp.hypothesisId,
      m3Hyp.driver,
      m3Hyp.priorConfidence,
      evidence,
      config
    );
    
    // Update confidence
    const confidenceUpdate = updateHypothesisConfidence(
      m3Hyp.priorConfidence,
      aggregate.evidenceConfidence,
      "weighted_average",
      config
    );
    
    // Determine status
    const { status, evidenceStatus, abstained } = determineHypothesisStatus(
      m3Hyp.priorConfidence,
      aggregate.evidenceConfidence,
      confidenceUpdate.updatedConfidence,
      aggregate.supportRatio,
      aggregate.contradictRatio,
      evidence.length,
      config
    );
    
    // Collect all evidence for this hypothesis
    const supportingEvidence = evidence.filter(e => e.direction === "support").map(e => e.id);
    const contradictingEvidence = evidence.filter(e => e.direction === "contradict").map(e => e.id);
    const neutralEvidence = evidence.filter(e => e.direction === "neutral").map(e => e.id);
    
    // Build EvidenceHypothesis
    const evidenceHyp: EvidenceHypothesis = {
      id: `evidence-hyp-${m3Hyp.hypothesisId}`,
      hypothesisId: m3Hyp.hypothesisId,
      driver: m3Hyp.driver,
      name: m3Hyp.name,
      description: m3Hyp.name,
      claim: m3Hyp.name,
      expectedDirection: m3Hyp.expectedDirection,
      priorConfidence: m3Hyp.priorConfidence,
      evidenceConfidence: aggregate.evidenceConfidence,
      updatedConfidence: confidenceUpdate.updatedConfidence,
      confidence: confidenceUpdate.updatedConfidence,
      supportingEvidenceIds: supportingEvidence,
      contradictoryEvidenceIds: contradictingEvidence,
      neutralEvidenceIds: neutralEvidence,
      evidenceCount: evidence.length,
      independentSourceCount: aggregate.independentSourceCount,
      sourceTypeDiversity: aggregate.sourceTypeDiversity,
      status: evidenceStatus,
      evidenceGaps: aggregate.evidenceGaps,
      contributionPct: null,
      signedContributionPct: null,
      magnitudeContributionPct: null,
      associationScore: null,
      pValue: null,
      isStatisticallySignificant: false,
      sampleSize: 0,
      temporalAlignment: null,
      bestLag: 0,
      lagDirection: "contemporaneous",
      segmentConsistency: null,
      causalPlausibility: null,
      evidenceAvailability: null,
      evidenceDetail: null,
      scoreBreakdown: {
        avgSemanticRelevance: aggregate.avgSemanticRelevance,
        avgSourceQuality: aggregate.avgSourceQuality,
        avgTemporalRelevance: aggregate.avgTemporalRelevance,
        avgEntityRelevance: aggregate.avgEntityRelevance,
        avgHypothesisAlignment: aggregate.avgHypothesisAlignment,
        supportRatio: aggregate.supportRatio,
        contradictionRatio: aggregate.contradictRatio,
        neutralityRatio: aggregate.neutralRatio,
        sourceIndependence: aggregate.independentSourceCount / 5,
        evidenceDiversity: aggregate.sourceTypeDiversity,
        contribution: 0,
        association: 0,
        temporal: 0,
        segmentConsistency: 0,
        causalPlausibility: 0,
        evidenceAvailability: 0,
        contradictionPenalty: 0,
      },
    };
    
    evidenceHypotheses.push(evidenceHyp);
    allContradictions.push(...contradictionResult.contradictions);
    allEvidenceGaps.push(...aggregate.evidenceGaps);
    confidenceUpdates.push(confidenceUpdate);
    
    // Update telemetry counts
    totalTelemetry.supportCount += supportingEvidence.length;
    totalTelemetry.contradictionCount += contradictingEvidence.length;
    totalTelemetry.neutralCount += neutralEvidence.length;
    totalTelemetry.evidenceGapCount += aggregate.evidenceGaps.length;
  }
  
  // Build evidence package
  const evidencePackage: EvidencePackage = {
    analysisId,
    metric: evidenceRequests[0]?.metric || "unknown",
    period: evidenceRequests[0]?.period || "unknown",
    hypotheses: evidenceHypotheses,
    allEvidence,
    contradictions: allContradictions,
    evidenceGaps: allEvidenceGaps,
    overallConfidence: evidenceHypotheses.length > 0
      ? evidenceHypotheses.reduce((sum, h) => sum + h.updatedConfidence, 0) / evidenceHypotheses.length
      : 0,
    status: determineOverallStatus(evidenceHypotheses),
    provenance: allEvidence.flatMap(e => [e.provenance]),
    telemetry: totalTelemetry,
  };
  
  // Verify provenance
  const verification = verifyEvidenceChain(evidencePackage);
  if (!verification.valid) {
    console.warn("Evidence chain verification issues:", verification.issues);
  }
  
  // Generate graph data
  const graphData = generateEvidenceGraph(evidencePackage);
  
  // Generate provenance summary
  const provenanceSummary = generateProvenanceSummary(evidencePackage);
  
  // Record telemetry
  recordRetrievalTelemetry(totalTelemetry, analysisId);
  recordScoringTelemetry(
    analysisId,
    analysisId,
    allEvidence.length,
    totalTelemetry.supportCount,
    totalTelemetry.contradictionCount,
    totalTelemetry.neutralCount,
    evidencePackage.overallConfidence,
    Date.now() - startTime
  );
  
  if (allContradictions.length > 0) {
    recordContradictionTelemetry(
      analysisId,
      analysisId,
      allContradictions.length,
      allContradictions.some(c => c.severity === "high") ? "high" :
      allContradictions.some(c => c.severity === "medium") ? "medium" : "low",
      0
    );
  }
  
  return {
    evidencePackage,
    graphData,
    telemetry: totalTelemetry,
    confidenceUpdates,
    provenanceSummary,
  };
}

/** Determine overall package status */
function determineOverallStatus(hypotheses: EvidenceHypothesis[]): "supported" | "mixed" | "insufficient_evidence" | "contradicted" {
  if (hypotheses.length === 0) return "insufficient_evidence";
  
  const statuses = hypotheses.map(h => h.status);
  const hasSupported = statuses.includes("supported");
  const hasContradicted = statuses.includes("contradicted");
  const hasInsufficient = statuses.includes("insufficient_evidence");
  
  if (hasContradicted && !hasSupported) return "contradicted";
  if (hasSupported && !hasContradicted && !hasInsufficient) return "supported";
  if (hasInsufficient && !hasSupported && !hasContradicted) return "insufficient_evidence";
  return "mixed";
}

let initializationPromise: Promise<void> | null = null;

/** Initialize Module 4 (seed synthetic evidence, etc.) - idempotent */
export async function initializeModule4(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await seedSyntheticEvidence();
      console.log("Module 4 initialized");
    })();
  }
  return initializationPromise;
}

/** Get telemetry summary for an analysis */
export function getAnalysisTelemetry(analysisId: string) {
  return getTelemetrySummary(analysisId);
}

/** Re-export types and utilities */
export * from "./types";
export * from "./retrieval";
export { 
  calculateSemanticRelevance, 
  calculateTermCoverage,
  calculateTemporalRelevance,
  calculateTemporalOverlap,
  getTemporalTier,
  calculateEntityRelevance,
  getEntityMatchDetails,
  getSourceQuality,
  getSourceQualityWithConfig,
  getSourceQualityTier,
  getAllSourceQualities,
  DEFAULT_SOURCE_QUALITY,
  classifyDirection,
  classifyUnstructuredDirection,
  classifyDirectionWithLLM,
  type LLMDirectionClassifier,
  type DirectionClassification,
  nullLLMClassifier,
  calculateEvidenceScore,
  scoreEvidenceItems,
  calculateHypothesisAggregateScores,
  type EvidenceScoreBreakdown,
  type HypothesisAggregateScores,
  type EvidenceConfidenceFactors
} from "./scoring";
export * from "./contradiction";
export * from "./confidence";
export * from "./provenance";
export * from "./graph";
export * from "./telemetry";
export * from "./queryBuilder";
export * from "./syntheticEvidence";
export { DEFAULT_EVIDENCE_SCORING_CONFIG } from "./types";