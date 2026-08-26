import { getDriverDefinition, getDriversForKPI, getAllDriverIds, DRIVER_DEFINITIONS } from "./definitions";
import { calculateAssociation } from "./association";
import { calculateTemporalAlignment } from "./temporal";
import { calculateSegmentConsistency } from "./segmentation";
import { detectContradictions } from "./contradiction";
import { calculateDriverContributions } from "./contribution";
import { calculateDimensionContribution } from "./contribution";
import type { DriverHypothesis, DriverAnalysis, EvidenceRequest, TemporalAlignment, SegmentConsistency, Contradiction } from "./types";
import { DEFAULT_DRIVER_CONFIG } from "./config";
import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";

function isValidKPIMetric(metric: string): boolean {
  const allMetrics = getAllKPIMetrics();
  return allMetrics.includes(metric.toLowerCase());
}

function supportsChannelDimension(metric: string): boolean {
  const normalizedMetric = normalizeMetric(metric);
  return ["revenue", "orders", "aov"].includes(normalizedMetric);
}

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
  
  const channelSupported = supportsChannelDimension(normalizedMetric);
  const dimensionPromises = [
    calculateDimensionContribution(metric, period, "region", filters),
    calculateDimensionContribution(metric, period, "product", filters),
  ];
  
  if (channelSupported) {
    dimensionPromises.push(calculateDimensionContribution(metric, period, "channel", filters));
  }
  
  const [contributions, dimensionContribs, associations, temporalAlignments, segmentConsistency] = await Promise.all([
    calculateDriverContributions(kpiDef.name, period, filters),
    Promise.all(dimensionPromises),
    Promise.all(drivers.map(async d => {
      try {
        return await calculateAssociation(kpiDef.name, d.id, period, filters);
      } catch {
        return { driver: d.id, pearsonR: 0, spearmanRho: 0, sampleSize: 0, associationStrength: "none" as const };
      }
    })),
    Promise.all(drivers.map(async d => {
      try {
        return await calculateTemporalAlignment(kpiDef.name, d.id, period, filters);
      } catch {
        return { driver: d.id, bestLag: 0, lagCorrelation: 0, temporalScore: 0 };
      }
    })),
    Promise.all(drivers.map(async d => {
      try {
        return await calculateSegmentConsistency(kpiDef.name, d.id, period, "region", filters);
      } catch {
        return { driver: d.id, consistencyScore: 0, consistentSegments: [], inconsistentSegments: [] };
      }
    })),
  ]);
  
  const contradictions = await detectContradictions(kpiDef.name, period, filters);
  
  const flatDimensions = dimensionContribs.flat();
  
  for (const driver of drivers) {
    const contrib = contributions.find(c => c.driver === driver.id);
    const association = associations.find(a => a.driver === driver.id);
    const temporal = temporalAlignments.find(t => t.driver === driver.id);
    const segment = segmentConsistency.find(s => s.driver === driver.id);
    const contradiction = contradictions.find(c => c.driver === driver.id);
    
    // For drivers without contribution data, create insufficient_data hypothesis
    if (!contrib) {
      hypotheses.push({
        id: `H${hypotheses.length + 1}`,
        name: driver.name,
        description: driver.description,
        driver: driver.id,
        claim: `Insufficient data to quantify ${driver.name} contribution`,
        expectedDirection: driver.expectedDirection,
        scope: {
          metric: kpiDef.name,
          period,
          region: filters?.region,
          product: filters?.product,
          channel: filters?.channel,
        },
        contributionPct: 0,
        associationScore: association?.pearsonR,
        temporalAlignment: temporal?.temporalScore,
        segmentConsistency: segment?.consistencyScore,
        causalPlausibility: normalizeCausalPlausibility(driver.id, driver.expectedDirection),
        evidenceAvailability: 0,
        score: 0,
        confidence: 0,
        status: "insufficient_data",
        caveats: ["No quantitative contribution data available for this driver"],
      });
      continue;
    }
    
    const contribContributionPct = contrib.contributionPct ?? 0;
    const contribChangePct = contrib.changePct ?? 0;
    const contributionScore = normalizeContribution(contribContributionPct);
    const associationScore = (association && association.pearsonR !== null) ? normalizeAssociation(association.pearsonR) : 0;
    const temporalScore = temporal ? normalizeTemporal(temporal) : 0;
    const segmentScore = segment ? normalizeSegmentConsistency(segment) : 0;
    const causalPlausibility = normalizeCausalPlausibility(driver.id, contribChangePct > 0 ? "positive" : "negative");
    
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
    
    // Generate claim based on contribution type
    let claim: string;
    if (contrib.contributionType === "exact") {
      claim = `${driver.name} ${contribChangePct > 0 ? "increased" : "decreased"} by ${Math.abs(contribChangePct).toFixed(1)}%, ${Math.abs(contrib.contributionPct ?? 0).toFixed(1)}% of ${kpiDef.label} change`;
    } else if (contrib.contributionType === "statistical") {
      claim = `${driver.name} changed by ${Math.abs(contribChangePct).toFixed(1)}%. Statistical association with ${kpiDef.label} observed but not an exact algebraic decomposition.`;
    } else {
      claim = `Insufficient data to quantify ${driver.name} contribution to ${kpiDef.label} change.`;
    }
    
    const expectedDirection = contribChangePct > 0 ? "positive" : "negative";
    
    hypotheses.push({
      id: `H${hypotheses.length + 1}`,
      name: driver.name,
      description: driver.description,
      driver: driver.id,
      claim,
      expectedDirection,
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

import { monthToDateRange } from "../utils/dateUtils";

export function generateEvidenceRequests(
  driverId: string,
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): EvidenceRequest[] {
  const def = DRIVER_DEFINITIONS[driverId];
  if (!def) return [];
  
  const { start, end } = monthToDateRange(period);
  
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
        dateStart: start,
        dateEnd: end,
      },
      requiredEvidence: [evidenceType],
    });
  }
  
  return requests;
}