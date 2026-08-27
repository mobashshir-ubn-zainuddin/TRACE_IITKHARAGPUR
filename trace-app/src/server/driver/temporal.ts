/**
 * Temporal alignment (Module 3, Task 9).
 *
 * Lag is defined as:
 *
 *   r(L) = Corr( Driver_{t-L}, KPI_t )
 *
 *   L > 0  driver LEADS the KPI      (driver moved first -- supports precedence)
 *   L = 0  contemporaneous           (moved together -- no precedence shown)
 *   L < 0  driver FOLLOWS the KPI    (driver moved after -- cannot explain it)
 *
 * The previous implementation scanned only L = 0..3, so it structurally could not
 * observe a driver that lags the KPI, and reported the raw |r| as the temporal
 * score. That let a driver which only moves *after* the KPI collect full temporal
 * support for "explaining" it.
 *
 * Two corrections:
 *   - the search is symmetric over L = -3..+3;
 *   - the score is penalised by direction. A driver that follows the KPI is
 *     scaled by `lagsPenaltyFactor`, so it can never present as strong temporal
 *     evidence. Contemporaneous movement is scaled by `contemporaneousFactor`,
 *     since co-movement alone demonstrates no precedence.
 *
 * As with association, correlation runs on MOVEMENT series, not raw levels.
 */

import type { TemporalAlignment } from "./types";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { normalizeMetric } from "../kpi/definitions";
import {
  getDriverHistory,
  getMonthsForPeriod,
  isDriverHistorySupported,
  ANALYSIS_WINDOW_MONTHS,
  UNSUPPORTED_DRIVERS,
  type DriverFilters,
} from "./history";
import { pearsonCorrelation, toMovementSeries, type MovementPoint } from "./stats";

export const TEMPORAL_WINDOW_MONTHS = ANALYSIS_WINDOW_MONTHS;

/** Shift a `YYYY-MM` period back by `lag` months. */
function shiftPeriod(period: string, lag: number): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(year, month - 1 - lag, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function classify(lag: number): "leads" | "contemporaneous" | "lags" {
  if (lag > 0) return "leads";
  if (lag < 0) return "lags";
  return "contemporaneous";
}

function empty(driver: string, reason: string): TemporalAlignment {
  return {
    driver,
    bestLag: 0,
    lagCorrelation: 0,
    temporalScore: 0,
    lagDirection: "contemporaneous",
    sampleSize: 0,
    insufficientData: true,
    lagProfile: [],
    reason,
  };
}

export async function calculateTemporalAlignment(
  metric: string,
  driver: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<TemporalAlignment> {
  const normalizedMetric = normalizeMetric(metric);

  if (!isDriverHistorySupported(driver)) {
    return empty(
      driver,
      UNSUPPORTED_DRIVERS[driver] ?? `No history resolver is defined for driver "${driver}".`
    );
  }

  // Same month list as the association engine, so both share one cached scan.
  // The window already extends well past the available data, so lag shifting
  // does not need extra months on top.
  const months = getMonthsForPeriod(period, TEMPORAL_WINDOW_MONTHS);

  const [metricHistory, driverHistory] = await Promise.all([
    getDriverHistory(normalizedMetric, months, filters),
    getDriverHistory(driver, months, filters),
  ]);

  const metricMovement = toMovementSeries(metricHistory.periods);
  const driverMovement = toMovementSeries(driverHistory.periods);

  if (metricMovement.length === 0 || driverMovement.length === 0) {
    return empty(driver, "No usable movement observations for the metric or the driver.");
  }

  const result = evaluateLagAlignment(metricMovement, driverMovement, config);
  if (!result) {
    const { minLagMonths, maxLagMonths, minObservations } = config.temporalAlignment;
    return empty(
      driver,
      `No lag in [${minLagMonths}, ${maxLagMonths}] had at least ${minObservations} paired observations.`
    );
  }

  return { driver, ...result };
}

/**
 * Pure lag search over two movement series. Extracted so the lead/lag semantics
 * are testable without a database.
 *
 * Returns null when no lag had enough paired observations.
 */
export function evaluateLagAlignment(
  metricMovement: MovementPoint[],
  driverMovement: MovementPoint[],
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Omit<TemporalAlignment, "driver"> | null {
  const driverByPeriod = new Map<string, number>(
    driverMovement.map((p: MovementPoint) => [p.period, p.deltaPct])
  );

  const { minLagMonths, maxLagMonths, minObservations, lagsPenaltyFactor, contemporaneousFactor } =
    config.temporalAlignment;

  const lagProfile: Array<{ lag: number; correlation: number; n: number }> = [];
  let bestLag = 0;
  let bestCorrelation = 0;
  let bestN = 0;
  let found = false;

  for (let lag = minLagMonths; lag <= maxLagMonths; lag++) {
    const x: number[] = [];
    const y: number[] = [];

    // r(L) = Corr(Driver_{t-L}, KPI_t)
    for (const kpiPoint of metricMovement) {
      const driverValue = driverByPeriod.get(shiftPeriod(kpiPoint.period, lag));
      if (driverValue === undefined) continue;
      x.push(driverValue);
      y.push(kpiPoint.deltaPct);
    }

    if (x.length < minObservations) continue;

    const r = pearsonCorrelation(x, y);
    if (r === null) continue;

    lagProfile.push({ lag, correlation: r, n: x.length });

    if (!found || Math.abs(r) > Math.abs(bestCorrelation)) {
      bestCorrelation = r;
      bestLag = lag;
      bestN = x.length;
      found = true;
    }
  }

  if (!found) return null;

  const lagDirection = classify(bestLag);

  // Direction-aware scoring: precedence is what gives temporal support.
  const directionFactor =
    lagDirection === "leads" ? 1
    : lagDirection === "contemporaneous" ? contemporaneousFactor
    : lagsPenaltyFactor;

  const temporalScore = Math.min(1, Math.max(0, Math.abs(bestCorrelation) * directionFactor));

  return {
    bestLag,
    lagCorrelation: bestCorrelation,
    temporalScore,
    lagDirection,
    sampleSize: bestN,
    insufficientData: false,
    lagProfile,
  };
}

/** Temporal alignment for every driver of a metric. */
export async function calculateAllTemporalAlignments(
  metric: string,
  drivers: string[],
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<TemporalAlignment[]> {
  return Promise.all(
    drivers.map(async (d) => {
      try {
        return await calculateTemporalAlignment(metric, d, period, filters, config);
      } catch (error) {
        return empty(d, `Temporal alignment failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
}
