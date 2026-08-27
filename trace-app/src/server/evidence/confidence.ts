/**
 * Module 4: Evidence Confidence & Hypothesis Confidence Update
 * 
 * Calculates evidence confidence from multiple factors and updates Module 3 hypothesis confidence.
 * Formula is deterministic and configurable.
 */

import type { EvidenceItem, EvidenceHypothesis, EvidenceRequest } from "./types";
import { DEFAULT_EVIDENCE_SCORING_CONFIG } from "./types";

export interface EvidenceConfidenceFactors {
  /** Average evidence score across all items */
  avgEvidenceScore: number;
  /** Ratio of supporting evidence */
  supportRatio: number;
  /** Ratio of contradicting evidence */
  contradictionRatio: number;
  /** Number of independent source types */
  independentSources: number;
  /** Source type diversity [0,1] */
  sourceDiversity: number;
  /** Total evidence count */
  evidenceCount: number;
  /** Whether critical source types are present */
  hasCriticalSources: boolean;
}

/** Calculate evidence confidence from factors */
export function calculateEvidenceConfidence(
  factors: EvidenceConfidenceFactors,
  config = DEFAULT_EVIDENCE_SCORING_CONFIG
): number {
  let confidence = factors.avgEvidenceScore;
  
  // Support ratio boost/penalty
  if (factors.supportRatio > 0.7) confidence += 0.15;
  else if (factors.supportRatio > 0.5) confidence += 0.08;
  else if (factors.supportRatio < 0.3) confidence -= 0.15;
  
  // Contradiction penalty
  if (factors.contradictionRatio > 0.3) confidence -= 0.2;
  else if (factors.contradictionRatio > 0.15) confidence -= 0.1;
  
  // Independent sources boost
  if (factors.independentSources >= 4) confidence += 0.15;
  else if (factors.independentSources >= 3) confidence += 0.1;
  else if (factors.independentSources >= 2) confidence += 0.05;
  
  // Source diversity boost
  confidence += factors.sourceDiversity * 0.1;
  
  // Evidence count boost (diminishing returns)
  if (factors.evidenceCount >= 10) confidence += 0.08;
  else if (factors.evidenceCount >= 5) confidence += 0.05;
  else if (factors.evidenceCount >= 3) confidence += 0.03;
  else if (factors.evidenceCount === 1) confidence -= 0.1;
  else if (factors.evidenceCount === 0) confidence = 0;
  
  // Critical sources (structured, internal_report, operations_report)
  if (factors.hasCriticalSources) confidence += 0.05;
  
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/** Extract confidence factors from evidence */
export function extractConfidenceFactors(evidence: EvidenceItem[]): EvidenceConfidenceFactors {
  if (evidence.length === 0) {
    return {
      avgEvidenceScore: 0,
      supportRatio: 0,
      contradictionRatio: 0,
      independentSources: 0,
      sourceDiversity: 0,
      evidenceCount: 0,
      hasCriticalSources: false,
    };
  }
  
  const supportCount = evidence.filter(e => e.direction === "support").length;
  const contradictCount = evidence.filter(e => e.direction === "contradict").length;
  const total = evidence.length;
  
  // Average evidence score
  const avgEvidenceScore = evidence.reduce((sum, e) => sum + e.evidenceScore, 0) / total;
  
  // Ratios
  const supportRatio = supportCount / total;
  const contradictionRatio = contradictCount / total;
  
  // Independent sources (unique source types)
  const sourceTypes = new Set(evidence.map(e => e.provenance.sourceType));
  const independentSources = sourceTypes.size;
  
  // Source diversity (normalized by expected max types)
  const sourceDiversity = Math.min(independentSources / 5, 1);
  
  // Critical sources check
  const criticalTypes = new Set(["structured", "internal_report", "operations_report"]);
  const hasCriticalSources = evidence.some(e => criticalTypes.has(e.provenance.sourceType));
  
  return {
    avgEvidenceScore,
    supportRatio,
    contradictionRatio,
    independentSources,
    sourceDiversity,
    evidenceCount: total,
    hasCriticalSources,
  };
}

/** Update Module 3 hypothesis confidence with Module 4 evidence */
export interface ConfidenceUpdateResult {
  priorConfidence: number;
  evidenceConfidence: number;
  updatedConfidence: number;
  confidenceChange: number;
  method: string;
}

/** Update hypothesis confidence using evidence confidence */
export function updateHypothesisConfidence(
  priorConfidence: number,
  evidenceConfidence: number,
  method: "weighted_average" | "bayesian_inspired" | "penalty_only" = "weighted_average",
  config = DEFAULT_EVIDENCE_SCORING_CONFIG
): ConfidenceUpdateResult {
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
      if (evidenceConfidence < config.thresholds.evidenceConfidenceThreshold) {
        updatedConfidence = priorConfidence * evidenceConfidence;
      } else {
        updatedConfidence = priorConfidence;
      }
      break;
    }
    
    default:
      updatedConfidence = priorConfidence;
  }
  
  const confidenceChange = updatedConfidence - priorConfidence;

  return {
    priorConfidence,
    evidenceConfidence,
    updatedConfidence: Math.max(0, Math.min(1, updatedConfidence)),
    confidenceChange,
    method,
  };
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