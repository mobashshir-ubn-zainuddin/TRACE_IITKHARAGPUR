/**
 * Contradiction detection (Module 3, Task 11).
 *
 * Previously a directional contradiction was raised whenever
 * `|correlation| > 0.3` pointed the "wrong" way, with no regard for whether the
 * correlation was distinguishable from noise. On a 12-point series, |r| = 0.35
 * has p ~ 0.26 -- entirely consistent with zero association -- so hypotheses
 * were being penalised on the strength of noise.
 *
 * A directional contradiction now requires ALL of:
 *   - a valid association (r computed, not insufficient/unsupported)
 *   - sampleSize >= config.contradiction.minSampleSize
 *   - pValue <= config.contradiction.alpha
 *   - |r| >= config.contradiction.minAbsCorrelation
 *   - observed direction opposite to the driver's expected direction
 *
 * Segment-level contradictions are retained, but are only raised when a
 * meaningful FRACTION of evaluated segments contradict, rather than on any
 * single segment.
 *
 * A contradiction never deletes a hypothesis. It is attached to the hypothesis,
 * subtracts a confidence penalty, and surfaces as a caveat.
 */

import type { Contradiction, AssociationResult, SegmentConsistency } from "./types";
import { getDriverDefinition, getDriversForKPI } from "./definitions";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { calculateAllAssociations } from "./association";
import { calculateAllSegmentConsistency } from "./segmentation";
import type { DriverFilters } from "./history";

/**
 * Derive contradictions from ALREADY-COMPUTED association and segment results.
 * This is the form used by the shared analysis context so nothing is requeried.
 */
export function deriveContradictions(
  associations: AssociationResult[],
  segmentResults: SegmentConsistency[],
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const segmentByDriver = new Map(segmentResults.map((s) => [s.driver, s]));

  for (const association of associations) {
    const def = getDriverDefinition(association.driver);
    if (!def) continue;

    // --- association-based contradiction --------------------------------
    const r = association.pearsonR;
    const hasValidAssociation =
      r !== null &&
      !association.insufficientData &&
      !association.unsupportedDriver &&
      Number.isFinite(r);

    if (hasValidAssociation) {
      const meetsEvidenceBar =
        association.sampleSize >= config.contradiction.minSampleSize &&
        association.pValue !== null &&
        association.pValue !== undefined &&
        association.pValue <= config.contradiction.alpha &&
        Math.abs(r!) >= config.contradiction.minAbsCorrelation;

      if (meetsEvidenceBar) {
        const observedDirection: "positive" | "negative" = r! > 0 ? "positive" : "negative";
        if (observedDirection !== def.expectedDirection) {
          contradictions.push({
            driver: association.driver,
            metric: def.name,
            expectedDirection: def.expectedDirection,
            observedDirection,
            effect: Math.abs(r!) >= config.correlationThresholds.moderate ? "invalidates" : "weakens",
            magnitude: Math.abs(r!),
            basis: "association",
            pValue: association.pValue,
            sampleSize: association.sampleSize,
            explanation:
              `${def.name} movement is ${observedDirection}ly associated with the metric ` +
              `(r=${r!.toFixed(2)}, p=${association.pValue!.toFixed(3)}, n=${association.sampleSize}), ` +
              `the opposite of the ${def.expectedDirection} direction this driver's mechanism predicts. ` +
              `This is a statistical association only and does not establish causation.`,
          });
        }
      }
    }

    // --- segment-based contradiction ------------------------------------
    const segment = segmentByDriver.get(association.driver);
    if (segment && !segment.insufficientData && (segment.evaluatedSegments ?? 0) > 0) {
      const inconsistentFraction =
        segment.inconsistentSegments.length / (segment.evaluatedSegments ?? 1);

      if (inconsistentFraction >= config.contradiction.segmentContradictionThreshold) {
        contradictions.push({
          driver: association.driver,
          metric: `${def.name} across segments`,
          expectedDirection: def.expectedDirection,
          observedDirection: def.expectedDirection === "positive" ? "negative" : "positive",
          effect: inconsistentFraction >= 0.75 ? "invalidates" : "weakens",
          magnitude: inconsistentFraction,
          basis: "segment",
          explanation:
            `${segment.inconsistentSegments.length} of ${segment.evaluatedSegments} evaluated segments ` +
            `(${(inconsistentFraction * 100).toFixed(0)}%) moved opposite to this driver's expected direction: ` +
            `${segment.inconsistentSegments.join(", ")}.`,
        });
      }
    }
  }

  return contradictions;
}

/**
 * Standalone entry point. Computes the inputs it needs, then delegates to
 * `deriveContradictions`. Prefer the shared analysis context where available so
 * these queries are not repeated.
 */
export async function detectContradictions(
  metric: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<Contradiction[]> {
  const normalizedMetric = normalizeMetric(metric);
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) return [];

  // Referenced so an unknown metric with no drivers short-circuits cleanly.
  if (getDriversForKPI(kpiDef.name).length === 0) return [];

  const [associations, segments] = await Promise.all([
    calculateAllAssociations(kpiDef.name, period, filters, config),
    calculateAllSegmentConsistency(kpiDef.name, period, "region", filters, config),
  ]);

  return deriveContradictions(associations, segments, config);
}
