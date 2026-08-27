/**
 * Segment consistency (Module 3, Task 10).
 *
 * The previous implementation called `getKPIBreakdown(driverId)`, which only
 * accepts KPI metrics, so every non-KPI driver threw and was recorded as
 * `consistencyScore: 0` -- indistinguishable from "measured, and inconsistent
 * everywhere". It also treated missing/zero-denominator segments as
 * contradictory rather than unmeasurable.
 *
 * This version resolves per-segment driver values through `getDriverBreakdown`,
 * and separates three outcomes explicitly:
 *
 *   consistent    - driver and KPI moved as the driver's expected direction predicts
 *   inconsistent  - both moved materially, but in the direction that contradicts it
 *   skipped       - could not be evaluated (no data, zero denominator, or neither
 *                   series moved materially). NOT counted against the driver.
 *
 * Direction rule:
 *   positive driver -> driver and KPI should move the SAME way
 *   negative driver -> driver and KPI should move in OPPOSITE ways
 */

import type { SegmentConsistency, CounterSegmentComparison } from "./types";
import { getDriverDefinition, getDriversForKPI } from "./definitions";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { prevMonth } from "../utils/dateUtils";
import {
  getDriverBreakdown,
  driverSupportsDimension,
  isDriverHistorySupported,
  UNSUPPORTED_DRIVERS,
  type DriverFilters,
  type BreakdownDimension,
} from "./history";

function unmeasurable(driver: string, reason: string): SegmentConsistency {
  return {
    driver,
    consistencyScore: 0,
    consistentSegments: [],
    inconsistentSegments: [],
    skippedSegments: [],
    evaluatedSegments: 0,
    insufficientData: true,
    affectedSegments: [],
    unaffectedSegments: [],
    reason,
  };
}

/** Percentage change, or null when the denominator is zero/invalid. */
function pctChange(prev: number, curr: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return null;
  if (prev === 0) return null;
  const v = ((curr - prev) / prev) * 100;
  return Number.isFinite(v) ? v : null;
}

export async function calculateSegmentConsistency(
  metric: string,
  driver: string,
  period: string,
  dimension: BreakdownDimension,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<SegmentConsistency> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getDriverDefinition(driver);

  if (!isDriverHistorySupported(driver)) {
    return unmeasurable(
      driver,
      UNSUPPORTED_DRIVERS[driver] ?? `No breakdown resolver is defined for driver "${driver}".`
    );
  }
  if (!driverSupportsDimension(driver, dimension)) {
    return unmeasurable(
      driver,
      `Driver "${driver}" has no ${dimension} grain in its source table.`
    );
  }
  if (!driverSupportsDimension(normalizedMetric, dimension)) {
    return unmeasurable(
      driver,
      `Metric "${normalizedMetric}" has no ${dimension} grain in its source table.`
    );
  }

  const previous = prevMonth(period);
  const [currMetric, prevMetricRows, currDriver, prevDriverRows] = await Promise.all([
    getDriverBreakdown(normalizedMetric, period, dimension, filters),
    getDriverBreakdown(normalizedMetric, previous, dimension, filters),
    getDriverBreakdown(driver, period, dimension, filters),
    getDriverBreakdown(driver, previous, dimension, filters),
  ]);

  const metricNow = new Map(currMetric.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));
  const metricBefore = new Map(prevMetricRows.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));
  const driverNow = new Map(currDriver.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));
  const driverBefore = new Map(prevDriverRows.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));

  // Only segments present on both sides of both series can be judged.
  const segments = [...metricNow.keys()].filter(
    (s) => metricBefore.has(s) && driverNow.has(s) && driverBefore.has(s)
  );
  const skippedForMissingData = [...new Set([...metricNow.keys(), ...driverNow.keys()])].filter(
    (s) => !segments.includes(s)
  );

  if (segments.length === 0) {
    return unmeasurable(driver, `No segment of "${dimension}" had data for both periods.`);
  }

  const expectedDirection = def?.expectedDirection ?? "positive";
  const material = config.segmentConsistency.materialChangePct;

  const consistentSegments: string[] = [];
  const inconsistentSegments: string[] = [];
  const skippedSegments: string[] = [...skippedForMissingData];
  const affectedSegments: NonNullable<SegmentConsistency["affectedSegments"]> = [];
  const unaffectedSegments: NonNullable<SegmentConsistency["unaffectedSegments"]> = [];

  for (const segment of segments) {
    const kpiChangePct = pctChange(metricBefore.get(segment)!, metricNow.get(segment)!);
    const driverChangePct = pctChange(driverBefore.get(segment)!, driverNow.get(segment)!);

    // Zero/undefined denominators are unmeasurable, not contradictory.
    if (kpiChangePct === null || driverChangePct === null) {
      skippedSegments.push(segment);
      continue;
    }

    const record = { segment, driverChangePct, kpiChangePct };
    if (Math.abs(kpiChangePct) >= material) affectedSegments.push(record);
    else unaffectedSegments.push(record);

    // If neither side moved materially there is no directional signal to read.
    if (Math.abs(kpiChangePct) < material || Math.abs(driverChangePct) < material) {
      skippedSegments.push(segment);
      continue;
    }

    const sameDirection = Math.sign(kpiChangePct) === Math.sign(driverChangePct);
    const isConsistent = expectedDirection === "positive" ? sameDirection : !sameDirection;

    if (isConsistent) consistentSegments.push(segment);
    else inconsistentSegments.push(segment);
  }

  const evaluatedSegments = consistentSegments.length + inconsistentSegments.length;

  if (evaluatedSegments < config.segmentConsistency.minSegmentsForConsistency) {
    return {
      driver,
      consistencyScore: 0,
      consistentSegments,
      inconsistentSegments,
      skippedSegments,
      evaluatedSegments,
      insufficientData: true,
      affectedSegments,
      unaffectedSegments,
      reason: `Only ${evaluatedSegments} segment(s) moved materially on both the driver and the KPI; ${config.segmentConsistency.minSegmentsForConsistency} required.`,
    };
  }

  return {
    driver,
    consistencyScore: consistentSegments.length / evaluatedSegments,
    consistentSegments,
    inconsistentSegments,
    skippedSegments,
    evaluatedSegments,
    insufficientData: false,
    affectedSegments,
    unaffectedSegments,
  };
}

export async function calculateAllSegmentConsistency(
  metric: string,
  period: string,
  dimension: BreakdownDimension,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<SegmentConsistency[]> {
  const normalizedMetric = normalizeMetric(metric);
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) throw new Error(`Unknown metric: ${metric}`);

  const drivers = getDriversForKPI(kpiDef.name);

  return Promise.all(
    drivers.map(async (d) => {
      try {
        return await calculateSegmentConsistency(kpiDef.name, d.id, period, dimension, filters, config);
      } catch (error) {
        return unmeasurable(
          d.id,
          `Segment consistency failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

/**
 * Compare how a metric moved in segments flagged as affected versus the rest.
 * Uses period-over-period change, not the raw level.
 */
export async function calculateCounterSegmentComparison(
  metric: string,
  driver: string,
  period: string,
  dimension: BreakdownDimension,
  affectedSegmentNames: string[],
  filters?: DriverFilters
): Promise<CounterSegmentComparison> {
  const normalizedMetric = normalizeMetric(metric);
  const previous = prevMonth(period);

  const [curr, prev] = await Promise.all([
    getDriverBreakdown(normalizedMetric, period, dimension, filters),
    getDriverBreakdown(normalizedMetric, previous, dimension, filters),
  ]);

  const now = new Map(curr.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));
  const before = new Map(prev.filter(r => r.hasData).map((r) => [r.dimensionValue, r.value]));

  const affected: { segment: string; change: number }[] = [];
  const unaffected: { segment: string; change: number }[] = [];

  for (const [segment, value] of now) {
    if (!before.has(segment)) continue;
    const change = value - before.get(segment)!;
    if (affectedSegmentNames.includes(segment)) affected.push({ segment, change });
    else unaffected.push({ segment, change });
  }

  const mean = (xs: { change: number }[]) =>
    xs.length > 0 ? xs.reduce((s, a) => s + a.change, 0) / xs.length : 0;

  const avgAffected = mean(affected);
  const avgUnaffected = mean(unaffected);

  // Ratio of movement in affected vs unaffected segments. 1 means no difference.
  const comparisonScore =
    avgUnaffected !== 0 && Number.isFinite(avgUnaffected)
      ? Math.abs(avgAffected) / Math.abs(avgUnaffected)
      : 1;

  return {
    driver,
    affectedSegments: affected,
    unaffectedSegments: unaffected,
    comparisonScore: Number.isFinite(comparisonScore) ? comparisonScore : 1,
  };
}
