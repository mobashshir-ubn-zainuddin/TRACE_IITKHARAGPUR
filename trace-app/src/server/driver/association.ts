/**
 * Association engine (Module 3, Tasks 7 and 8).
 *
 * Two corrections relative to the previous implementation:
 *
 * 1. DRIVER RESOLUTION. It used to call `getKPIHistoryBatched(driverId)`, which
 *    only understands the five KPI metrics. Every other driver threw, the throw
 *    was swallowed, and the result was reported as `pearsonR = 0` -- statistically
 *    indistinguishable from "measured, and genuinely uncorrelated". It now uses
 *    `getDriverHistory`, and genuinely missing data is reported as
 *    `pearsonR: null, insufficientData: true` instead of a fabricated zero.
 *
 * 2. MOVEMENT, NOT LEVELS. It used to correlate raw KPI levels. Two series that
 *    both trend upward over 18 months correlate near 1.0 whether or not they
 *    move together, so trending levels manufacture spurious association. We now
 *    correlate period-over-period percentage changes.
 *
 * Significance (Task 8) uses t = r * sqrt((n-2)/(1-r^2)) on df = n-2, evaluated
 * against a two-tailed Student t distribution.
 *
 * INTERPRETATION: `isStatisticallySignificant` means the observed linear
 * association is unlikely under the null of zero association. It is NOT a claim
 * of causation and carries no directional/causal implication on its own.
 */

import type { AssociationResult } from "./types";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { getDriversForKPI } from "./definitions";
import {
  getDriverHistory,
  getMonthsForPeriod,
  isDriverHistorySupported,
  ANALYSIS_WINDOW_MONTHS,
  UNSUPPORTED_DRIVERS,
  type DriverFilters,
} from "./history";
import {
  pearsonCorrelation,
  spearmanCorrelation,
  correlationPValue,
  toMovementSeries,
  alignMovementSeries,
} from "./stats";

/** Months of history pulled for correlation. Shared with temporal.ts so both reuse one cached scan. */
export const ASSOCIATION_WINDOW_MONTHS = ANALYSIS_WINDOW_MONTHS;

function getAssociationStrength(
  r: number,
  thresholds: DriverConfig["correlationThresholds"]
): "none" | "weak" | "moderate" | "strong" {
  const absR = Math.abs(r);
  if (absR < thresholds.none) return "none";
  if (absR < thresholds.weak) return "weak";
  if (absR < thresholds.moderate) return "moderate";
  return "strong";
}

function insufficient(
  driver: string,
  sampleSize: number,
  reason: string,
  unsupportedDriver = false
): AssociationResult {
  return {
    driver,
    pearsonR: null,
    spearmanRho: null,
    sampleSize,
    associationStrength: "none",
    pValue: null,
    isStatisticallySignificant: false,
    alpha: DEFAULT_DRIVER_CONFIG.significanceAlpha,
    insufficientData: true,
    unsupportedDriver,
    reason,
  };
}

/**
 * Correlate a driver's movement series against a KPI's movement series.
 *
 * @param metric  KPI id (revenue, orders, aov, conversion, marketingROI)
 * @param driver  driver id resolvable by `getDriverHistory`
 */
export async function calculateAssociation(
  metric: string,
  driver: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<AssociationResult> {
  const normalizedMetric = normalizeMetric(metric);

  if (!isDriverHistorySupported(driver)) {
    return insufficient(
      driver,
      0,
      UNSUPPORTED_DRIVERS[driver] ?? `No history resolver is defined for driver "${driver}".`,
      true
    );
  }

  const months = getMonthsForPeriod(period, ASSOCIATION_WINDOW_MONTHS);

  const [metricHistory, driverHistory] = await Promise.all([
    getDriverHistory(normalizedMetric, months, filters),
    getDriverHistory(driver, months, filters),
  ]);

  const metricMovement = toMovementSeries(metricHistory.periods);
  const driverMovement = toMovementSeries(driverHistory.periods);
  const { x, y } = alignMovementSeries(metricMovement, driverMovement);

  const n = x.length;
  if (n < config.minimumCorrelationSamples) {
    return insufficient(
      driver,
      n,
      `Only ${n} paired movement observations available; ${config.minimumCorrelationSamples} required.`
    );
  }

  const pearsonR = pearsonCorrelation(x, y);
  const spearmanRho = spearmanCorrelation(x, y);

  // A constant movement series (zero variance) leaves correlation undefined.
  if (pearsonR === null) {
    return insufficient(
      driver,
      n,
      "Correlation is undefined: one of the movement series has zero variance."
    );
  }

  const pValue = correlationPValue(pearsonR, n);
  const alpha = config.significanceAlpha;

  return {
    driver,
    pearsonR,
    spearmanRho,
    sampleSize: n,
    associationStrength: getAssociationStrength(pearsonR, config.correlationThresholds),
    pValue,
    isStatisticallySignificant: pValue !== null && pValue <= alpha,
    alpha,
    insufficientData: false,
  };
}

/**
 * Associations for every driver of `metric`.
 * Unlike the previous version, drivers are NOT filtered down to those that
 * happen to be KPI metrics -- that filter is what hid most drivers from the
 * statistical layer entirely.
 */
export async function calculateAllAssociations(
  metric: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<AssociationResult[]> {
  const normalizedMetric = normalizeMetric(metric);
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) throw new Error(`Unknown metric: ${metric}`);

  const drivers = getDriversForKPI(kpiDef.name);

  return Promise.all(
    drivers.map(async (d) => {
      try {
        return await calculateAssociation(kpiDef.name, d.id, period, filters, config);
      } catch (error) {
        return insufficient(
          d.id,
          0,
          `Association could not be computed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}

export { getMonthsForPeriod };
