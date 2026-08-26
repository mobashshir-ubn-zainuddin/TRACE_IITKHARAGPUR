import { generateHypotheses, generateEvidenceRequests } from "./hypothesis";
import { calculateDriverContributions } from "./contribution";
import { calculateDimensionContribution } from "./contribution";
import { calculateAllAssociations } from "./association";
import { calculateAllSegmentConsistency } from "./segmentation";
import { detectContradictions } from "./contradiction";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import type { DriverAnalysis, DriverHypothesis, DimensionContribution, EvidenceRequest } from "./types";

export async function analyzeDrivers(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DriverAnalysis> {
  const normalizedMetric = normalizeMetric(metric);
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const [
    contributions,
    dimensionContribs,
    associations,
    segmentConsistency,
    contradictions,
  ] = await Promise.all([
    calculateDriverContributions(normalizedMetric, period, filters),
    Promise.all([
      calculateDimensionContribution(normalizedMetric, period, "region" as const, filters),
      calculateDimensionContribution(normalizedMetric, period, "product" as const, filters),
      calculateDimensionContribution(normalizedMetric, period, "channel" as const, filters),
    ]),
    calculateAllAssociations(normalizedMetric, period, filters),
    calculateAllSegmentConsistency(normalizedMetric, period, "region" as const, filters ?? {}),
    detectContradictions(normalizedMetric, period, filters),
  ]);

  const flatDimensions = dimensionContribs.flat();
  const hypotheses = await generateHypotheses(metric, period, filters);

  const evidenceRequests: EvidenceRequest[] = [];
  for (const hypothesis of hypotheses) {
    if (hypothesis.status !== "insufficient_data") {
      const requests = generateEvidenceRequests(hypothesis.driver, metric, period, filters);
      evidenceRequests.push(...requests);
    }
  }

  const totalConfidence = hypotheses.length > 0
    ? hypotheses.reduce((sum, h) => sum + h.confidence, 0) / hypotheses.length
    : 0;

  return {
    metric: normalizedMetric,
    period,
    totalChange: 0,
    totalChangePct: 0,
    dimensions: flatDimensions,
    drivers: hypotheses,
    alternatives: hypotheses.slice(1, 4),
    contradictions,
    evidenceRequests,
    confidence: totalConfidence,
  };
}

async function getDriverAnalysis(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DriverAnalysis> {
  return analyzeDrivers(metric, period, filters);
}

export type { DriverAnalysis, DriverHypothesis, DimensionContribution, EvidenceRequest } from "./types";
export { getDriverDefinition, getDriversForKPI } from "./definitions";
export { calculateDriverContributions, calculateDimensionContribution } from "./contribution";
export { calculateAssociation, calculateAllAssociations } from "./association";
export { calculateTemporalAlignment } from "./temporal";
export { calculateSegmentConsistency, calculateCounterSegmentComparison } from "./segmentation";
export { detectContradictions } from "./contradiction";
export { generateHypotheses, generateEvidenceRequests } from "./hypothesis";