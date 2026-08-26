import { getDriverDefinition, getDriversForKPI, getAllDriverIds, DRIVER_DEFINITIONS } from "./definitions";
import { calculateAssociation } from "./association";
import { calculateTemporalAlignment } from "./temporal";
import { calculateSegmentConsistency } from "./segmentation";
import { detectContradictions } from "./contradiction";
import { calculateDriverContributions } from "./contribution";
import { calculateDimensionContribution } from "./contribution";
import type { DriverHypothesis, DriverAnalysis, EvidenceRequest, TemporalAlignment, SegmentConsistency, Contradiction } from "./types";
import { DEFAULT_DRIVER_CONFIG } from "./config";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";

function normalizeContribution(contributionPct: number): number {
  if (contributionPct >= 50) return 0.9;
  if (contributionPct >= 30) return 0.7;
  if (contributionPct >= 15) return 0.5;
  if (contributionPct >= 5) return 0.3;
  return 0.1;
}

function normalizeAssociation(r: number): number {
  const absR = Math.abs(r);
  if (absR >= 0.85) return 1.0;
  if (absR >= 0.7) return 0.8;
  if (absR >= 0.5) return 0.6;
  if (absR >= 0.3) return 0.4;
  return 0.1;
}

function normalizeTemporal(temporal: TemporalAlignment): number {
  return temporal.temporalScore;
}

function normalizeSegmentConsistency(consistency: SegmentConsistency): number {
  return consistency.consistencyScore;
}

function normalizeCausalPlausibility(driver: string, expectedDirection: string): number {
  const def = DRIVER_DEFINITIONS[driver];
  if (!def) return 0.5;
  
  let score = 0.5;
  
  if (def.controllable) score += 0.1;
  if (def.candidateLevers.length > 2) score += 0.1;
  if (def.expectedDirection === "negative") score += 0.1;
  
  return Math.min(1, Math.max(0, score));
}

function normalizeEvidenceAvailability(evidenceRequests: EvidenceRequest[]): number {
  if (evidenceRequests.length === 0) return 0;
  return Math.min(1, evidenceRequests.length / 5);
}

export async function generateHypotheses(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DriverHypothesis[]> {
  const normalizedMetric = normalizeMetric(metric);
  const kpiDef = getKPIDefinition(normalizedMetric);
  
  if (!kpiDef) throw new Error(`Unknown metric: ${metric}`);
  
  const drivers = getDriversForKPI(kpiDef.name);
  const config = DEFAULT_DRIVER_CONFIG;
  const hypotheses: DriverHypothesis[] = [];
  
  const [contributions, dimensionContribs, associations, temporalAlignments, segmentConsistency] = await Promise.all([
    calculateDriverContributions(kpiDef.name, period, filters),
    Promise.all([
      calculateDimensionContribution(metric, period, "region", filters),
      calculateDimensionContribution(metric, period, "product", filters),
      calculateDimensionContribution(metric, period, "channel", filters),
    ]),
    Promise.all(drivers.map(d => calculateAssociation(kpiDef.name, d.id, period, filters))),
    Promise.all(drivers.map(d => calculateTemporalAlignment(kpiDef.name, d.id, period, filters))),
    Promise.all(drivers.map(d => calculateSegmentConsistency(kpiDef.name, d.id, period, "region", filters))),
  ]);
  
  const contradictions = await detectContradictions(kpiDef.name, period, filters);
  
  const flatDimensions = dimensionContribs.flat();
  
  for (const driver of drivers) {
    const contrib = contributions.find(c => c.driver === driver.id);
    const association = associations.find(a => a.driver === driver.name);
    const temporal = temporalAlignments.find(t => t.driver === driver.name);
    const segment = segmentConsistency.find(s => s.driver === driver.name);
    const contradiction = contradictions.find(c => c.driver === driver.id);
    
    if (!contrib) continue;
    
    const contributionScore = normalizeContribution(contrib.contributionPct);
    const associationScore = association ? normalizeAssociation(association.pearsonR) : 0;
    const temporalScore = temporal ? normalizeTemporal(temporal) : 0;
    const segmentScore = segment ? normalizeSegmentConsistency(segment) : 0;
    const causalPlausibility = normalizeCausalPlausibility(driver.id, contrib.changePct > 0 ? "positive" : "negative");
    
    const evidenceRequests = generateEvidenceRequests(driver.id, kpiDef.name, period, filters);
    const evidenceScore = normalizeEvidenceAvailability(evidenceRequests);
    
    const weights = config.hypothesisWeights;
    const score = 
      weights.contribution * contributionScore +
      weights.association * associationScore +
      weights.temporal * temporalScore +
      weights.segmentConsistency * segmentScore +
      weights.causalPlausibility * causalPlausibility +
      weights.evidenceAvailability * evidenceScore;
    
    let confidence = score;
    
    if (contradiction) {
      if (contradiction.effect === "invalidates") {
        confidence -= config.contradictionPenalties.invalidates;
      } else {
        confidence -= config.contradictionPenalties.weakens;
      }
    }
    
    confidence = Math.max(0, Math.min(1, confidence));
    
    let status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
    if (confidence >= config.hypothesisThresholds.strongCandidate) {
      status = "strong_candidate";
    } else if (confidence >= config.hypothesisThresholds.candidate) {
      status = "candidate";
    } else if (confidence >= config.hypothesisThresholds.weakCandidate) {
      status = "weak_candidate";
    } else {
      status = "insufficient_data";
    }
    
    const caveats: string[] = [];
    if (contributionScore < 0.3) caveats.push("Low contribution to overall change");
    if (associationScore < 0.4) caveats.push("Weak statistical association");
    if (temporalScore < 0.3) caveats.push("Poor temporal alignment");
    if (segmentScore < 0.5) caveats.push("Inconsistent across segments");
    if (causalPlausibility < 0.4) caveats.push("Low causal plausibility");
    if (evidenceScore < 0.3) caveats.push("Limited evidence available");
    if (contradiction) caveats.push(`Contradiction detected: ${contradiction.metric} shows ${contradiction.observedDirection} trend (expected ${contradiction.expectedDirection})`);
    
    hypotheses.push({
      id: `H${hypotheses.length + 1}`,
      name: driver.name,
      description: driver.description,
      driver: driver.id,
      claim: `${driver.name} ${contrib.changePct > 0 ? "increased" : "decreased"} by ${Math.abs(contrib.changePct).toFixed(1)}%, ${contrib.contributionPct.toFixed(1)}% of ${kpiDef.label} change`,
      expectedDirection: contrib.changePct > 0 ? "positive" : "negative",
      scope: {
        metric: kpiDef.name,
        period,
        region: filters?.region,
        product: filters?.product,
        channel: filters?.channel,
      },
      contributionPct: contrib.contributionPct,
      associationScore: association?.pearsonR,
      temporalAlignment: temporal?.temporalScore,
      segmentConsistency: segment?.consistencyScore,
      causalPlausibility,
      evidenceAvailability: evidenceScore,
      score,
      confidence,
      status,
      caveats,
    });
  }
  
  hypotheses.sort((a, b) => b.score - a.score);
  
  for (let i = 0; i < hypotheses.length; i++) {
    hypotheses[i].id = `H${i + 1}`;
  }
  
  return hypotheses;
}

export function generateEvidenceRequests(
  driverId: string,
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): EvidenceRequest[] {
  const def = DRIVER_DEFINITIONS[driverId];
  if (!def) return [];
  
  const requests: EvidenceRequest[] = [];
  
  for (const evidenceType of def.candidateLevers) {
    requests.push({
      hypothesisId: `H${driverId}`,
      metric,
      period,
      driver: def.name,
      query: `${def.name} ${metric} ${period} ${filters?.region || ""}`,
      filters: {
        region: filters?.region,
        product: filters?.product,
        dateStart: `${period}-01`,
        dateEnd: `${period}-31`,
      },
      requiredEvidence: [evidenceType],
    });
  }
  
  return requests;
}