/**
 * Module 4: Evidence + RAG Types
 * 
 * Contract between Module 3 (Driver/Hypothesis Engine) and Module 4 (Evidence/RAG).
 * Module 3 generates EvidenceRequest[] that Module 4 consumes.
 * Module 4 returns EvidencePackage with scored evidence, contradictions, and confidence updates.
 */

import type { EvidenceRequest as M3EvidenceRequest } from "../driver/types";

// Re-export Module 3 EvidenceRequest as the input contract
export type EvidenceRequest = M3EvidenceRequest;

/** Classification of evidence relative to a hypothesis */
export type EvidenceDirection = "support" | "contradict" | "neutral";

/** Source types for evidence */
export type EvidenceSourceType = 
  | "structured"           // SQL/ERP data (sales_transactions, marketing_daily, operations_daily)
  | "internal_report"      // Official internal reports
  | "operations_report"    // Operations team reports
  | "support_ticket"       // Customer support tickets
  | "customer_review"      // Customer reviews/feedback
  | "marketing_report"     // Marketing reports
  | "pricing_report"       // Pricing reports
  | "fulfillment_report"   // Fulfillment/logistics reports
  | "inventory_report"     // Inventory reports
  | "sales_transactions"   // Sales transactions table
  | "unverified";          // Unverified external sources

/** Provenance information for every evidence item */
export interface Provenance {
  source: string;                    // Source system/table name
  sourceType: EvidenceSourceType;    // Type of source
  documentId?: number;               // Document ID if from documents table
  chunkId?: number;                  // Chunk ID if from document_chunks
  region?: string;                   // Region this evidence pertains to
  product?: string;                  // Product this evidence pertains to
  channel?: string;                  // Channel this evidence pertains to
  metric?: string;                   // KPI metric
  period?: string;                   // Time period
  dateStart?: string;                // Start date for temporal evidence
  dateEnd?: string;                  // End date for temporal evidence
  documentDate?: string;             // Document date for temporal evidence
  retrievalMethod: "structured" | "keyword" | "vector" | "hybrid";
  embeddingModel?: string;           // Model used for vector retrieval
  query?: string;                    // Query used to retrieve this evidence
  contentHash: string;               // SHA256 of evidence content
  timestamp: string;                 // When this evidence was retrieved/scored
}

/** Individual evidence item with full provenance and scoring */
export interface EvidenceItem {
  id: string;                         // Unique evidence ID
  hypothesisId: string;               // Which hypothesis this evidence relates to
  driver: string;                     // Driver name
  text: string;                       // Evidence text/content
  direction: EvidenceDirection;       // support | contradict | neutral
  
  // Scoring components (transparent, configurable weights)
  semanticRelevance: number;          // [0,1] - similarity to query
  sourceQuality: number;              // [0,1] - authority of source
  temporalRelevance: number;          // [0,1] - time alignment with hypothesis period
  entityRelevance: number;            // [0,1] - region/product/channel match
  hypothesisAlignment: number;        // [0,1] - supports expected direction
  
  // Final weighted score
  evidenceScore: number;              // Final weighted score [0,1]
  
  // Provenance
  provenance: Provenance;
  
  // For structured evidence
  structuredData?: {
    metric: string;
    period: string;
    value: number;
    changePct?: number;
    table: string;
    query: string;
  };
}

/** Evidence aggregated per hypothesis */
export interface EvidenceHypothesis {
  id: string;
  hypothesisId: string;
  driver: string;
  name: string;
  description: string;
  claim: string;
  expectedDirection: "positive" | "negative";
  priorConfidence: number;            // Module 3 confidence
  evidenceConfidence: number;         // Module 4 evidence confidence
  updatedConfidence: number;          // Combined/updated confidence
  confidence: number;                 // Alias for updatedConfidence
  
supportingEvidenceIds: string[];    // Evidence IDs with direction = "support"
  contradictoryEvidenceIds: string[]; // Evidence IDs with direction = "contradict"
  neutralEvidenceIds: string[];       // Evidence IDs with direction = "neutral"
  
  contributionPct?: number | null;
  signedContributionPct?: number | null;
  magnitudeContributionPct?: number | null;
  associationScore?: number | null;
  pValue?: number | null;
  isStatisticallySignificant?: boolean;
  sampleSize?: number;
  temporalAlignment?: number | null;
  bestLag?: number;
  lagDirection?: "leads" | "contemporaneous" | "lags";
  segmentConsistency?: number | null;
  causalPlausibility?: number | null;
  evidenceAvailability?: number | null;
  evidenceDetail?: Record<string, unknown> | null;
  
  evidenceCount: number;              // Total evidence items
  independentSourceCount: number;     // Number of independent source types
  sourceTypeDiversity: number;        // Diversity of source types [0,1]
  
  status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  evidenceGaps: EvidenceGap[];
  
  /** Per-component scores for transparency */
  scoreBreakdown?: {
    avgSemanticRelevance: number;
    avgSourceQuality: number;
    avgTemporalRelevance: number;
    avgEntityRelevance: number;
    avgHypothesisAlignment: number;
    contribution: number;
    association: number;
    temporal: number;
    segmentConsistency: number;
    causalPlausibility: number;
    evidenceAvailability: number;
    contradictionPenalty: number;
    supportRatio: number;
    contradictionRatio: number;
    neutralityRatio: number;
    sourceIndependence: number;
    evidenceDiversity: number;
  };
}

/** Missing evidence that was requested but not found */
export interface EvidenceGap {
  type: "missing_data" | "no_evidence" | "weak_evidence" | "contradicted";
  description: string;
  impact: "high" | "medium" | "low";
  requestedSource: string;            // What source was expected
  requiredEvidence: string;           // From EvidenceRequest.requiredEvidence
  hypothesisId: string;
}

/** Cross-hypothesis contradictions detected from evidence */
export interface EvidenceContradiction {
  hypothesisId: string;
  driver: string;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  severity: "low" | "medium" | "high";
  description: string;
  resolution?: "retained" | "weakened" | "invalidated";
}

/** Complete evidence package returned by Module 4 */
export interface EvidencePackage {
  analysisId: string;                 // Unique analysis run ID
  metric: string;
  period: string;
  
  hypotheses: EvidenceHypothesis[];
  allEvidence: EvidenceItem[];
  contradictions: EvidenceContradiction[];
  evidenceGaps: EvidenceGap[];
  
  overallConfidence: number;          // Aggregate confidence across hypotheses
  status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  
  provenance: Provenance[];
  telemetry: RetrievalTelemetry;
}

/** Retrieval and processing telemetry */
export interface RetrievalTelemetry {
  retrievalLatencyMs: number;
  embeddingLatencyMs: number;
  rerankingLatencyMs: number;
  scoringLatencyMs: number;
  structuredLatencyMs: number;
  keywordLatencyMs: number;
  vectorLatencyMs: number;
  totalLatencyMs: number;
  
  keywordCandidateCount: number;
  vectorCandidateCount: number;
  structuredCandidateCount: number;
  mergedCandidateCount: number;
  rerankedCount: number;
  topK: number;
  
  embeddingCacheHit: boolean;
  embeddingCacheMiss: boolean;
  
  supportCount: number;
  contradictionCount: number;
  neutralCount: number;
  evidenceGapCount: number;
  
  llmCalls?: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
  llmLatencyMs?: number;
  estimatedCost?: number;
}

/** Configuration for evidence scoring weights */
export interface EvidenceScoringConfig {
  weights: {
    semanticRelevance: number;    // 0.30 default
    sourceQuality: number;        // 0.20 default
    temporalRelevance: number;    // 0.15 default
    entityRelevance: number;      // 0.15 default
    hypothesisAlignment: number;  // 0.20 default
  };
  thresholds: {
    supportMinScore: number;      // Minimum score for "support"
    contradictMinScore: number;   // Minimum score for "contradict"
    evidenceConfidenceThreshold: number; // Threshold for sufficient evidence
    abstentionThreshold: number;  // Below this = insufficient_evidence
  };
  sourceQualityDefaults: Record<EvidenceSourceType, number>;
}

/** Default scoring configuration */
export const DEFAULT_EVIDENCE_SCORING_CONFIG: EvidenceScoringConfig = {
  weights: {
    semanticRelevance: 0.30,
    sourceQuality: 0.20,
    temporalRelevance: 0.15,
    entityRelevance: 0.15,
    hypothesisAlignment: 0.20,
  },
  thresholds: {
    supportMinScore: 0.6,
    contradictMinScore: 0.6,
    evidenceConfidenceThreshold: 0.5,
    abstentionThreshold: 0.3,
  },
  sourceQualityDefaults: {
    structured: 1.00,
    internal_report: 0.90,
    operations_report: 0.90,
    support_ticket: 0.70,
    customer_review: 0.60,
    marketing_report: 0.75,
    pricing_report: 0.80,
    fulfillment_report: 0.80,
    inventory_report: 0.85,
    sales_transactions: 1.00,
    unverified: 0.40,
  },
};

/** Query builder input/output */
export interface QueryBuilderInput {
  evidenceRequest: EvidenceRequest;
  analysisContext?: {
    metric: string;
    period: string;
    totalChangePct: number;
    signalDirection: "positive" | "negative" | "flat";
    signalStrength: number;
  };
}

export interface QueryBuilderOutput {
  structuredQueries: Array<{
    table: string;
    sql: string;
    params: unknown[];
    description: string;
  }>;
  unstructuredQueries: Array<{
    query: string;
    filters: {
      region?: string;
      product?: string;
      dateStart?: string;
      dateEnd?: string;
      sourceType?: EvidenceSourceType[];
      documentType?: string[];
    };
    requiredEvidence: string[];
  }>;
  expandedTerms: string[];  // LLM-expanded terms (optional)
}