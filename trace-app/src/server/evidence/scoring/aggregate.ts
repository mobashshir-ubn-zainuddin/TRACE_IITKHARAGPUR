/**
 * Module 4: Aggregate Evidence Scoring
 * 
 * Combines all component scores into final evidence score using configurable weights.
 * 
 * Default formula:
 * evidenceScore = 
 *    0.30 * semanticRelevance
 *  + 0.20 * sourceQuality
 *  + 0.15 * temporalRelevance
 *  + 0.15 * entityRelevance
 *  + 0.20 * hypothesisAlignment
 */

import type { EvidenceItem, EvidenceRequest, EvidenceScoringConfig, EvidenceDirection, EvidenceGap } from "../types";
import { calculateSemanticRelevance } from "./relevance";
import { calculateTemporalRelevance } from "./temporal";
import { calculateEntityRelevance } from "./entity";
import { getSourceQuality } from "./sourceQuality";
import { classifyDirection, type DirectionClassification } from "./direction";
import { DEFAULT_EVIDENCE_SCORING_CONFIG } from "../types";

export interface EvidenceConfidenceFactors {
  evidenceCount: number;
  supportRatio: number;
  contradictionRatio: number;
  independentSources: number;
  sourceDiversity: number;
  hasCriticalSources: boolean;
  avgScore: number;
}

export interface EvidenceScoreBreakdown {
  semanticRelevance: number;
  sourceQuality: number;
  temporalRelevance: number;
  entityRelevance: number;
  hypothesisAlignment: number;
  direction: EvidenceDirection;
  directionConfidence: number;
  finalScore: number;
  weights: EvidenceScoringConfig["weights"];
}

/** Calculate complete evidence score with breakdown */
export function calculateEvidenceScore(
  item: EvidenceItem,
  request: EvidenceRequest,
  expectedDirection: "positive" | "negative",
  config: EvidenceScoringConfig = DEFAULT_EVIDENCE_SCORING_CONFIG
): EvidenceScoreBreakdown {
  // Calculate component scores
  const semanticRelevance = calculateSemanticRelevance(item, request);
  const sourceQuality = getSourceQuality(item);
  const temporalRelevance = calculateTemporalRelevance(item, request);
  const entityRelevance = calculateEntityRelevance(item, request);
  
  // Direction classification
  const directionResult = classifyDirection(item, request, expectedDirection);
  const hypothesisAlignment = directionResult.direction === "support" ? 0.8 :
                              directionResult.direction === "contradict" ? 0.2 : 0.5;
  
  // Apply weights
  const { weights } = config;
  const finalScore = 
    weights.semanticRelevance * semanticRelevance +
    weights.sourceQuality * sourceQuality +
    weights.temporalRelevance * temporalRelevance +
    weights.entityRelevance * entityRelevance +
    weights.hypothesisAlignment * hypothesisAlignment;
  
  return {
    semanticRelevance,
    sourceQuality,
    temporalRelevance,
    entityRelevance,
    hypothesisAlignment,
    direction: directionResult.direction,
    directionConfidence: directionResult.confidence,
    finalScore: Math.min(Math.max(finalScore, 0), 1), // Clamp to [0,1]
    weights,
  };
}

/** Score multiple evidence items */
export function scoreEvidenceItems(
  items: EvidenceItem[],
  request: EvidenceRequest,
  expectedDirection: "positive" | "negative",
  config?: EvidenceScoringConfig
): Array<EvidenceItem & { scoreBreakdown: EvidenceScoreBreakdown }> {
  return items.map(item => {
    const breakdown = calculateEvidenceScore(item, request, expectedDirection, config);
    return {
      ...item,
      evidenceScore: breakdown.finalScore,
      scoreBreakdown: breakdown,
    };
  });
}

/** Calculate aggregate scores for a hypothesis */
export interface HypothesisAggregateScores {
  hypothesisId: string;
  driver: string;
  priorConfidence: number;
  evidenceCount: number;
  supportCount: number;
  contradictCount: number;
  neutralCount: number;
  avgEvidenceScore: number;
  avgSemanticRelevance: number;
  avgSourceQuality: number;
  avgTemporalRelevance: number;
  avgEntityRelevance: number;
  avgHypothesisAlignment: number;
  supportRatio: number;
  contradictRatio: number;
  neutralRatio: number;
  independentSourceCount: number;
  sourceTypeDiversity: number;
  evidenceConfidence: number;
  updatedConfidence: number;
  status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  evidenceGaps: EvidenceGap[];
}

/** Calculate aggregate scores for a hypothesis */
export function calculateHypothesisAggregateScores(
  hypothesisId: string,
  driver: string,
  priorConfidence: number,
  evidence: EvidenceItem[],
  config: EvidenceScoringConfig = DEFAULT_EVIDENCE_SCORING_CONFIG
): HypothesisAggregateScores {
  if (evidence.length === 0) {
return {
    hypothesisId,
    driver,
    priorConfidence,
    evidenceCount: 0,
    supportCount: 0,
    contradictCount: 0,
    neutralCount: 0,
    avgEvidenceScore: 0,
    avgSemanticRelevance: 0,
    avgSourceQuality: 0,
    avgTemporalRelevance: 0,
    avgEntityRelevance: 0,
    avgHypothesisAlignment: 0,
    supportRatio: 0,
    contradictRatio: 0,
    neutralRatio: 0,
    independentSourceCount: 0,
    sourceTypeDiversity: 0,
    evidenceConfidence: 0,
    updatedConfidence: priorConfidence * 0.5, // Heavy penalty for no evidence
    status: "insufficient_evidence",
    evidenceGaps: [{ type: "no_evidence", description: "No evidence retrieved for this hypothesis", impact: "high", requestedSource: "any", requiredEvidence: "any", hypothesisId }],
  };
  }
  
  // Count directions
  const supportCount = evidence.filter(e => e.direction === "support").length;
  const contradictCount = evidence.filter(e => e.direction === "contradict").length;
  const neutralCount = evidence.filter(e => e.direction === "neutral").length;
  
  // Calculate averages
  const avgEvidenceScore = evidence.reduce((sum, e) => sum + e.evidenceScore, 0) / evidence.length;
  const avgSemanticRelevance = evidence.reduce((sum, e) => sum + e.semanticRelevance, 0) / evidence.length;
  const avgSourceQuality = evidence.reduce((sum, e) => sum + e.sourceQuality, 0) / evidence.length;
  const avgTemporalRelevance = evidence.reduce((sum, e) => sum + e.temporalRelevance, 0) / evidence.length;
  const avgEntityRelevance = evidence.reduce((sum, e) => sum + e.entityRelevance, 0) / evidence.length;
  const avgHypothesisAlignment = evidence.reduce((sum, e) => sum + e.hypothesisAlignment, 0) / evidence.length;
  
  // Ratios
  const supportRatio = supportCount / evidence.length;
  const contradictRatio = contradictCount / evidence.length;
  const neutralRatio = neutralCount / evidence.length;
  
  // Independent source count (unique source types)
  const sourceTypes = new Set(evidence.map(e => e.provenance.sourceType));
  const independentSourceCount = sourceTypes.size;
  
  // Source type diversity (normalized by max possible types)
  const sourceTypeDiversity = Math.min(independentSourceCount / 5, 1); // Max 5 types
  
  // Evidence confidence
  const evidenceConfidence = calculateEvidenceConfidence(
    avgEvidenceScore,
    supportRatio,
    contradictRatio,
    independentSourceCount,
    sourceTypeDiversity,
    evidence.length
  );
  
  // Update hypothesis confidence
  const updatedConfidence = updateHypothesisConfidence(priorConfidence, evidenceConfidence, "weighted_average", config);
  
  // Determine status
  let status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  
  if (evidenceConfidence < config.thresholds.abstentionThreshold) {
    status = "insufficient_evidence";
  } else if (contradictRatio > supportRatio && contradictRatio > 0.4) {
    status = "contradicted";
  } else if (supportRatio > 0.6 && contradictRatio < 0.2) {
    status = "supported";
  } else {
    status = "mixed";
  }
  
  // Identify evidence gaps
  const evidenceGaps = identifyEvidenceGaps(evidence, driver);
  
  return {
    hypothesisId,
    driver,
    priorConfidence,
    evidenceCount: evidence.length,
    supportCount,
    contradictCount,
    neutralCount,
    avgEvidenceScore,
    avgSemanticRelevance,
    avgSourceQuality,
    avgTemporalRelevance,
    avgEntityRelevance,
    avgHypothesisAlignment,
    supportRatio,
    contradictRatio,
    neutralRatio,
    independentSourceCount,
    sourceTypeDiversity,
    evidenceConfidence,
    updatedConfidence,
    status,
    evidenceGaps: evidenceGaps.map(g => ({
      type: g.type,
      description: g.description,
      impact: g.impact,
      requestedSource: g.requestedSource,
      requiredEvidence: g.requiredEvidence,
      hypothesisId,
    })),
  };
}

/** Identify missing evidence based on required evidence and retrieved evidence */
function identifyEvidenceGaps(evidence: EvidenceItem[], driver: string): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  
  if (evidence.length === 0) {
    gaps.push({
      type: "no_evidence",
      description: `No evidence retrieved for driver: ${driver}`,
      impact: "high",
      requestedSource: "structured + unstructured",
      requiredEvidence: "Any evidence supporting or contradicting the hypothesis",
      hypothesisId: "",
    });
    return gaps;
  }
  
  // Check for weak evidence (low scores)
  const lowScoreEvidence = evidence.filter(e => e.evidenceScore < 0.4);
  if (lowScoreEvidence.length > 0) {
    gaps.push({
      type: "weak_evidence",
      description: `${lowScoreEvidence.length} evidence items have low confidence scores (< 0.4)`,
      impact: "medium",
      requestedSource: "higher authority sources",
      requiredEvidence: "Stronger evidence from more authoritative sources",
      hypothesisId: "",
    });
  }
  
  // Check for lack of structured evidence
  const hasStructured = evidence.some(e => e.provenance.retrievalMethod === "structured");
  if (!hasStructured) {
    gaps.push({
      type: "missing_data",
      description: "No structured (governed SQL) evidence found",
      impact: "high",
      requestedSource: "governed data layer",
      requiredEvidence: "Quantitative metrics from governed tables",
      hypothesisId: "",
    });
  }
  
  // Check for source type diversity
  const sourceTypes = new Set(evidence.map(e => e.provenance.sourceType));
  if (sourceTypes.size < 2) {
    gaps.push({
      type: "missing_data",
      description: `Low source diversity: only ${sourceTypes.size} source type(s) found`,
      impact: "medium",
      requestedSource: "additional source types",
      requiredEvidence: "Evidence from multiple independent source types",
      hypothesisId: "",
    });
  }
  
  return gaps;
}

/** Calculate evidence confidence from aggregate metrics */
function calculateEvidenceConfidence(
  avgScore: number,
  supportRatio: number,
  contradictRatio: number,
  independentSources: number,
  sourceDiversity: number,
  evidenceCount: number
): number {
  // Base confidence from average score
  let confidence = avgScore;
  
  // Boost for strong support
  if (supportRatio > 0.6) confidence += 0.1;
  if (supportRatio > 0.8) confidence += 0.1;
  
  // Penalty for contradictions
  if (contradictRatio > 0.2) confidence -= contradictRatio * 0.3;
  if (contradictRatio > 0.4) confidence -= 0.1;
  
  // Boost for multiple independent sources
  if (independentSources >= 3) confidence += 0.1;
  else if (independentSources >= 2) confidence += 0.05;
  
  // Boost for source diversity
  confidence += sourceDiversity * 0.1;
  
  // Boost for evidence volume (diminishing returns)
  if (evidenceCount >= 3) confidence += 0.05;
  if (evidenceCount >= 5) confidence += 0.05;
  if (evidenceCount >= 10) confidence += 0.05;
  
  return Math.min(Math.max(confidence, 0), 1);
}

/** Update hypothesis confidence with evidence confidence */
export function updateHypothesisConfidence(
  priorConfidence: number,
  evidenceConfidence: number,
  method: "weighted_average" | "bayesian_inspired" | "penalty_only" = "weighted_average",
  config = DEFAULT_EVIDENCE_SCORING_CONFIG
): number {
  let updatedConfidence: number;
  
  switch (method) {
    case "weighted_average": {
      // Weighted average: 60% evidence, 40% prior
      const evidenceWeight = 0.6;
      const priorWeight = 0.4;
      updatedConfidence = priorWeight * priorConfidence + evidenceWeight * evidenceConfidence;
      break;
    }
    
    case "bayesian_inspired": {
      // Bayesian-inspired: treat prior as beta distribution, evidence as likelihood
      // Simplified: if evidence strongly supports, increase; if contradicts, decrease
      if (evidenceConfidence > 0.7) {
        updatedConfidence = Math.min(1, priorConfidence + (1 - priorConfidence) * 0.5);
      } else if (evidenceConfidence < 0.3) {
        updatedConfidence = Math.max(0, priorConfidence * 0.5);
      } else {
        updatedConfidence = priorConfidence;
      }
      break;
    }
    
    case "penalty_only": {
      // Only penalize if evidence is weak/contradictory, never boost
      if (evidenceConfidence < 0.5) {
        updatedConfidence = priorConfidence * evidenceConfidence;
      } else {
        updatedConfidence = priorConfidence;
      }
      break;
    }
    
    default:
      updatedConfidence = priorConfidence;
  }
  
  return Math.max(0, Math.min(1, updatedConfidence));
}

/** Determine final hypothesis status from evidence */
export function determineHypothesisStatus(
  priorConfidence: number,
  evidenceConfidence: number,
  updatedConfidence: number,
  supportRatio: number,
  contradictionRatio: number,
  evidenceCount: number,
  config = DEFAULT_EVIDENCE_SCORING_CONFIG
): {
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  evidenceStatus: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  abstained: boolean;
} {
  // Check for abstention
  const abstained = evidenceConfidence < config.thresholds.abstentionThreshold || 
                    evidenceCount === 0;
  
  // Evidence status
  let evidenceStatus: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
  
  if (abstained || evidenceCount === 0) {
    evidenceStatus = "insufficient_evidence";
  } else if (contradictionRatio > supportRatio && contradictionRatio > 0.3) {
    evidenceStatus = "contradicted";
  } else if (supportRatio > 0.6 && contradictionRatio < 0.2) {
    evidenceStatus = "supported";
  } else {
    evidenceStatus = "mixed";
  }
  
  // Final hypothesis status (combines prior with evidence)
  let status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  
  if (abstained) {
    status = "insufficient_data";
  } else if (updatedConfidence >= 0.8) {
    status = "strong_candidate";
  } else if (updatedConfidence >= 0.6) {
    status = "candidate";
  } else if (updatedConfidence >= 0.4) {
    status = "weak_candidate";
  } else {
    status = "insufficient_data";
  }
  
  return { status, evidenceStatus, abstained };
}

/** Generate confidence explanation for UI */
export function generateConfidenceExplanation(
  priorConfidence: number,
  evidenceConfidence: number,
  updatedConfidence: number,
  factors: EvidenceConfidenceFactors,
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data" | "contradicted"
): string {
  const parts: string[] = [];
  
  parts.push(`Prior confidence: ${(priorConfidence * 100).toFixed(0)}%`);
  parts.push(`Evidence confidence: ${(evidenceConfidence * 100).toFixed(0)}%`);
  parts.push(`Updated confidence: ${(updatedConfidence * 100).toFixed(0)}%`);
  
  if (factors.evidenceCount === 0) {
    parts.push("No evidence retrieved - confidence reflects prior only");
  } else {
    const supportPct = (factors.supportRatio * 100).toFixed(0);
    const contradictPct = (factors.contradictionRatio * 100).toFixed(0);
    parts.push(`${factors.evidenceCount} evidence items (${supportPct}% support, ${contradictPct}% contradict)`);
    parts.push(`${factors.independentSources} independent source types`);
    
    if (factors.hasCriticalSources) {
      parts.push("Includes high-authority structured/official sources");
    }
  }
  
  if (status === "insufficient_data") {
    parts.push("⚠ Insufficient evidence for reliable conclusion");
  } else if (status === "strong_candidate") {
    parts.push("✓ Strong candidate with good evidence support");
  } else if (status === "contradicted") {
    parts.push("⚠ Evidence contradicts hypothesis");
  }
  
  return parts.join(". ");
}