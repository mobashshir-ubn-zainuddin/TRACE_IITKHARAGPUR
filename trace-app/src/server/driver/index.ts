/**
 * Module 3 public surface.
 *
 * `analyzeDrivers()` and `generateHypotheses()` now share ONE analysis context
 * (Task 17), so requesting both for the same scope costs a single computation.
 */

import { buildHypothesesFromContext, generateEvidenceRequests } from "./hypothesis";
import { getDriverAnalysisContext } from "./context";
import { normalizeMetric } from "../kpi/definitions";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import type { DriverAnalysis, EvidenceRequest } from "./types";
import type { DriverFilters } from "./history";

export async function analyzeDrivers(
  metric: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<DriverAnalysis> {
  const normalizedMetric = normalizeMetric(metric);
  const ctx = await getDriverAnalysisContext(normalizedMetric, period, filters ?? {}, config);

  // Same context -> no recomputation of associations/segments/contradictions.
  const hypotheses = buildHypothesesFromContext(ctx);

  const evidenceRequests: EvidenceRequest[] = [];
  for (const hypothesis of hypotheses) {
    if (hypothesis.status !== "insufficient_data") {
      evidenceRequests.push(
        ...generateEvidenceRequests(hypothesis.driver, normalizedMetric, period, filters)
      );
    }
  }

  const scored = hypotheses.filter((h) => h.status !== "insufficient_data");
  const confidence =
    scored.length > 0 ? scored.reduce((sum, h) => sum + h.confidence, 0) / scored.length : 0;

  return {
    metric: normalizedMetric,
    period,
    totalChange: ctx.totalChange,
    totalChangePct: ctx.totalChangePct,
    dimensions: ctx.dimensions,
    contributions: ctx.contributions,
    drivers: hypotheses,
    alternatives: hypotheses.slice(1, 4),
    contradictions: ctx.contradictions,
    evidenceRequests,
    confidence,
    unsupportedDrivers: ctx.unsupportedDrivers,
    segmentationDimension: ctx.segmentationDimension,
  };
}

export type {
  DriverAnalysis,
  DriverHypothesis,
  DimensionContribution,
  DriverContribution,
  EvidenceRequest,
  AssociationResult,
  TemporalAlignment,
  SegmentConsistency,
  Contradiction,
} from "./types";

export { getDriverDefinition, getDriversForKPI, getAllDriverIds, DRIVER_DEFINITIONS } from "./definitions";
export {
  calculateDriverContributions,
  calculateDimensionContribution,
  calculateRevenueDecomposition,
  calculateProductMixDecomposition,
  shapleyTwoFactorChange,
  contributionShares,
} from "./contribution";
export { calculateAssociation, calculateAllAssociations } from "./association";
export { calculateTemporalAlignment, calculateAllTemporalAlignments } from "./temporal";
export { calculateSegmentConsistency, calculateCounterSegmentComparison, calculateAllSegmentConsistency } from "./segmentation";
export { detectContradictions, deriveContradictions } from "./contradiction";
export {
  generateHypotheses,
  generateEvidenceRequests,
  buildHypothesesFromContext,
  calculateCausalPlausibility,
  calculateEvidenceAvailability,
} from "./hypothesis";
export { getDriverAnalysisContext, type DriverAnalysisContext } from "./context";
export {
  getDriverHistory,
  getDriverBreakdown,
  getMonthsForPeriod,
  isDriverHistorySupported,
  driverSupportsDimension,
  getSupportedDriverIds,
  getDriverHistoryFormula,
  UNSUPPORTED_DRIVERS,
  type DriverFilters,
  type DriverHistory,
} from "./history";
export { driverCache, makeDriverCacheKey, DRIVER_CACHE_TTL_MS } from "./cache";
export { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
