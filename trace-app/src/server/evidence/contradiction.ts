/**
 * Module 4: Contradiction Detection
 * 
 * Detects contradictions between evidence items and between evidence and hypotheses.
 * Returns contradiction details with severity classification.
 */

import type { EvidenceItem, EvidenceContradiction, EvidenceHypothesis } from "./types";

export interface ContradictionDetectionResult {
  contradictions: EvidenceContradiction[];
  hasContradictions: boolean;
  maxSeverity: "low" | "medium" | "high" | "none";
}

/** Detect contradictions within evidence for a single hypothesis */
export function detectEvidenceContradictions(
  hypothesisId: string,
  driver: string,
  evidence: EvidenceItem[]
): ContradictionDetectionResult {
  const contradictions: EvidenceContradiction[] = [];
  
  if (evidence.length < 2) {
    return { contradictions: [], hasContradictions: false, maxSeverity: "none" };
  }
  
  // Group by direction
  const supporting = evidence.filter(e => e.direction === "support");
  const contradicting = evidence.filter(e => e.direction === "contradict");
  const neutral = evidence.filter(e => e.direction === "neutral");
  
  // If we have both supporting and contradicting evidence
  if (supporting.length > 0 && contradicting.length > 0) {
    // Determine severity based on source authority
    const maxSupportAuthority = Math.max(...supporting.map(e => getSourceAuthority(e.provenance.sourceType)));
    const maxContradictAuthority = Math.max(...contradicting.map(e => getSourceAuthority(e.provenance.sourceType)));
    
    let severity: "low" | "medium" | "high";
    if (maxContradictAuthority >= 0.9) severity = "high";
    else if (maxContradictAuthority >= 0.7) severity = "medium";
    else severity = "low";
    
    // Determine resolution
    let resolution: "retained" | "weakened" | "invalidated";
    if (supporting.length >= contradicting.length * 2 && maxSupportAuthority > maxContradictAuthority) {
      resolution = "retained";
    } else if (contradicting.length >= supporting.length) {
      resolution = "invalidated";
    } else {
      resolution = "weakened";
    }
    
    contradictions.push({
      hypothesisId,
      driver,
      supportingEvidenceIds: supporting.map(e => e.id),
      contradictoryEvidenceIds: contradicting.map(e => e.id),
      severity,
      description: `Found ${supporting.length} supporting and ${contradicting.length} contradicting evidence items. ` +
        `Contradiction severity: ${severity}. Resolution: ${resolution}.`,
      resolution,
    });
  }
  
  // Check for internal contradictions in structured evidence
  const structuredEvidence = evidence.filter(e => e.provenance.retrievalMethod === "structured");
  if (structuredEvidence.length >= 2) {
    const structuredContradictions = detectStructuredContradictions(hypothesisId, driver, structuredEvidence);
    contradictions.push(...structuredContradictions);
  }
  
  // Check for temporal contradictions (e.g., early evidence says X, late evidence says Y)
  const temporalContradictions = detectTemporalContradictions(hypothesisId, driver, evidence);
  contradictions.push(...temporalContradictions);
  
  const maxSeverity = contradictions.length === 0 ? "none" :
    contradictions.some(c => c.severity === "high") ? "high" :
    contradictions.some(c => c.severity === "medium") ? "medium" : "low";
  
  return {
    contradictions,
    hasContradictions: contradictions.length > 0,
    maxSeverity,
  };
}

/** Detect contradictions in structured evidence (different metrics saying different things) */
function detectStructuredContradictions(
  hypothesisId: string,
  driver: string,
  evidence: EvidenceItem[]
): EvidenceContradiction[] {
  const contradictions: EvidenceContradiction[] = [];
  
  // Group by metric
  const byMetric = new Map<string, EvidenceItem[]>();
  for (const e of evidence) {
    const metric = e.provenance.metric || "unknown";
    if (!byMetric.has(metric)) byMetric.set(metric, []);
    byMetric.get(metric)!.push(e);
  }
  
  // For each metric with multiple evidence items, check direction consistency
  for (const [metric, items] of byMetric) {
    if (items.length < 2) continue;
    
    const directions = items.map(e => e.direction);
    const hasSupport = directions.includes("support");
    const hasContradict = directions.includes("contradict");
    
    if (hasSupport && hasContradict) {
      const supporting = items.filter(e => e.direction === "support");
      const contradicting = items.filter(e => e.direction === "contradict");
      
      contradictions.push({
        hypothesisId,
        driver,
        supportingEvidenceIds: supporting.map(e => e.id),
contradictoryEvidenceIds: contradicting.map(e => e.id),
        severity: "high", // Structured contradictions are high severity
        description: `Structured metric "${metric}" shows contradictory directions: ` +
          `${supporting.length} supporting, ${contradicting.length} contradicting`,
        resolution: "weakened",
      });
    }
  }
  
  return contradictions;
}

/** Detect temporal contradictions (early evidence says X, late evidence says Y) */
function detectTemporalContradictions(
  hypothesisId: string,
  driver: string,
  evidence: EvidenceItem[]
): EvidenceContradiction[] {
  const contradictions: EvidenceContradiction[] = [];
  
  // Sort by date
  const datedEvidence = evidence
    .filter(e => e.provenance.dateStart || e.provenance.dateEnd)
    .sort((a, b) => {
      const dateA = a.provenance.dateStart || a.provenance.dateEnd || "";
      const dateB = b.provenance.dateStart || b.provenance.dateEnd || "";
      return dateA.localeCompare(dateB);
    });
  
  if (datedEvidence.length < 2) return contradictions;
  
  // Check if early evidence contradicts late evidence
  const early = datedEvidence.slice(0, Math.ceil(datedEvidence.length / 2));
  const late = datedEvidence.slice(Math.ceil(datedEvidence.length / 2));
  
  const earlySupport = early.filter(e => e.direction === "support").length;
  const earlyContradict = early.filter(e => e.direction === "contradict").length;
  const lateSupport = late.filter(e => e.direction === "support").length;
  const lateContradict = late.filter(e => e.direction === "contradict").length;
  
  // Early says support, late says contradict (or vice versa)
  if (earlySupport > earlyContradict && lateContradict > lateSupport) {
    contradictions.push({
      hypothesisId,
      driver,
      supportingEvidenceIds: early.filter(e => e.direction === "support").map(e => e.id),
      contradictoryEvidenceIds: late.filter(e => e.direction === "contradict").map(e => e.id),
      severity: "medium",
      description: `Temporal contradiction: Early evidence supports hypothesis, but later evidence contradicts it.`,
      resolution: "weakened",
    });
  } else if (earlyContradict > earlySupport && lateSupport > lateContradict) {
    contradictions.push({
      hypothesisId,
      driver,
      supportingEvidenceIds: late.filter(e => e.direction === "support").map(e => e.id),
      contradictoryEvidenceIds: early.filter(e => e.direction === "contradict").map(e => e.id),
      severity: "medium",
      description: `Temporal contradiction: Early evidence contradicts hypothesis, but later evidence supports it (recovery signal).`,
      resolution: "retained",
    });
  }
  
  return contradictions;
}

/** Detect contradictions across hypotheses */
export function detectCrossHypothesisContradictions(
  hypotheses: EvidenceHypothesis[]
): EvidenceContradiction[] {
  const contradictions: EvidenceContradiction[] = [];
  
  // Check if two hypotheses have mutually exclusive claims
  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      const h1 = hypotheses[i];
      const h2 = hypotheses[j];
      
      // If both are strong candidates but have opposite expected directions
      if (h1.expectedDirection !== h2.expectedDirection &&
          h1.confidence > 0.7 && h2.confidence > 0.7) {
        contradictions.push({
          hypothesisId: `${h1.hypothesisId},${h2.hypothesisId}`,
          driver: `${h1.driver} vs ${h2.driver}`,
          supportingEvidenceIds: [],
          contradictoryEvidenceIds: [],
          severity: "high",
          description: `Cross-hypothesis contradiction: ${h1.driver} (${h1.expectedDirection}) vs ${h2.driver} (${h2.expectedDirection}). Both have high confidence but opposite expected directions.`,
          resolution: "weakened",
        });
      }
    }
  }
  
  return contradictions;
}

/** Get source authority score for contradiction severity */
function getSourceAuthority(sourceType: string): number {
  const authorities: Record<string, number> = {
    structured: 1.00,
    internal_report: 0.90,
    operations_report: 0.90,
    pricing_report: 0.80,
    inventory_report: 0.85,
    fulfillment_report: 0.80,
    marketing_report: 0.75,
    support_ticket: 0.70,
    customer_review: 0.60,
    unverified: 0.40,
  };
  return authorities[sourceType] || 0.5;
}