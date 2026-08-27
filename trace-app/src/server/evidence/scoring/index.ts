/**
 * Module 4: Scoring - Main Export
 */

export { calculateSemanticRelevance, calculateTermCoverage } from "./relevance";
export { calculateTemporalRelevance, calculateTemporalOverlap, getTemporalTier } from "./temporal";
export { calculateEntityRelevance, getEntityMatchDetails } from "./entity";
export { getSourceQuality, getSourceQualityWithConfig, getSourceQualityTier, getAllSourceQualities, DEFAULT_SOURCE_QUALITY } from "./sourceQuality";
export { classifyDirection, classifyUnstructuredDirection, classifyDirectionWithLLM, type LLMDirectionClassifier, type DirectionClassification, nullLLMClassifier } from "./direction";
export { 
  calculateEvidenceScore, 
  scoreEvidenceItems, 
  calculateHypothesisAggregateScores,
  updateHypothesisConfidence,
  determineHypothesisStatus,
  generateConfidenceExplanation,
  type EvidenceScoreBreakdown,
  type HypothesisAggregateScores,
  type EvidenceConfidenceFactors
} from "./aggregate";
export { DEFAULT_EVIDENCE_SCORING_CONFIG } from "../types";