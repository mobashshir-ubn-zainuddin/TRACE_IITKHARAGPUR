import { generateHypotheses, generateEvidenceRequests } from "./hypothesis";
import { calculateDriverContributions } from "./contribution";
import { calculateDimensionContribution } from "./contribution";
import { calculateAllAssociations } from "./association";
import { calculateAllSegmentConsistency } from "./segmentation";
import { detectContradictions } from "./contradiction";
import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";
import { computeKPI } from "../kpi";
import type { DriverAnalysis, DriverHypothesis, DimensionContribution, EvidenceRequest } from "./types";

function supportsChannelDimension(metric: string): boolean {
  const normalizedMetric = normalizeMetric(metric);
  return ["revenue", "orders", "aov"].includes(normalizedMetric);
}

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

  // Get current and previous KPI values to calculate total change
  const filterOpts = { region: filters?.region, product: filters?.product, channel: filters?.channel };
  const prevPeriod = getPreviousPeriod(period);
  
  const [currentKPI, previousKPI] = await Promise.all([
    computeKPI(normalizedMetric, period, filterOpts),
    computeKPI(normalizedMetric, prevPeriod, filterOpts),
  ]);

  const totalChange = currentKPI.value - previousKPI.value;
  const totalChangePct = previousKPI.value !== 0 ? ((currentKPI.value - previousKPI.value) / previousKPI.value) * 100 : 0;

  const channelSupported = supportsChannelDimension(normalizedMetric);
  const dimensionPromises = [
    calculateDimensionContribution(normalizedMetric, period, "region" as const, filters),
    calculateDimensionContribution(normalizedMetric, period, "product" as const, filters),
  ];
  
  if (channelSupported) {
    dimensionPromises.push(calculateDimensionContribution(normalizedMetric, period, "channel" as const, filters));
  }

  const [
    contributions,
    dimensionContribs,
    associations,
    segmentConsistency,
    contradictions,
  ] = await Promise.all([
    calculateDriverContributions(normalizedMetric, period, filters),
    Promise.all(dimensionPromises),
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
    totalChange,
    totalChangePct,
    dimensions: flatDimensions,
    drivers: hypotheses,
    alternatives: hypotheses.slice(1, 4),
    contradictions,
    evidenceRequests,
    confidence: totalConfidence,
  };
}

function getPreviousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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