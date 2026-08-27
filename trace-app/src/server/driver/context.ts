/**
 * Shared driver analysis context (Module 3, Task 17).
 *
 * `analyzeDrivers()` used to compute contributions, dimensions, associations,
 * segment consistency and contradictions, then call `generateHypotheses()`,
 * which computed most of the same things over again -- and `detectContradictions()`
 * internally recomputed associations and segment consistency a third time. On
 * the 537k-row sales table that redundancy is what produced the ~88s / ~2min
 * response times.
 *
 * Everything expensive is now computed exactly once here, and both
 * `analyzeDrivers()` and `generateHypotheses()` consume the same context.
 *
 * The whole context is memoized in the driver cache, keyed on
 * metric|period|region|product|channel, so repeated dashboard requests within
 * the TTL are served without touching SQLite at all.
 */

import type {
  AssociationResult,
  Contradiction,
  DimensionContribution,
  DriverContribution,
  DriverDefinition,
  SegmentConsistency,
  TemporalAlignment,
} from "./types";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { getKPIDefinition, normalizeMetric, type KPIDefinition } from "../kpi/definitions";
import { getDriversForKPI } from "./definitions";
import { calculateAllAssociations } from "./association";
import { calculateAllTemporalAlignments } from "./temporal";
import { calculateAllSegmentConsistency } from "./segmentation";
import { deriveContradictions } from "./contradiction";
import { calculateDimensionContribution, calculateDriverContributions } from "./contribution";
import {
  getDriverHistory,
  driverSupportsDimension,
  isDriverHistorySupported,
  UNSUPPORTED_DRIVERS,
  type DriverFilters,
  type BreakdownDimension,
} from "./history";
import { driverCache, makeDriverCacheKey } from "./cache";
import { prevMonth } from "../utils/dateUtils";

export interface DriverAnalysisContext {
  metric: string;
  period: string;
  previousPeriod: string;
  filters: DriverFilters;
  kpiDef: KPIDefinition;
  config: DriverConfig;
  drivers: DriverDefinition[];

  currentValue: number;
  previousValue: number;
  totalChange: number;
  totalChangePct: number;

  contributions: DriverContribution[];
  dimensions: DimensionContribution[];
  /** Dimension actually used for segment-consistency evaluation. */
  segmentationDimension: BreakdownDimension;
  associations: AssociationResult[];
  temporalAlignments: TemporalAlignment[];
  segmentConsistency: SegmentConsistency[];
  contradictions: Contradiction[];

  unsupportedDrivers: Array<{ driver: string; reason: string }>;
}

const CANDIDATE_DIMENSIONS: BreakdownDimension[] = ["region", "product", "channel", "campaign"];

/**
 * Build the analysis context for one scope. Cached; concurrent callers for the
 * same scope share a single computation.
 */
export async function getDriverAnalysisContext(
  metric: string,
  period: string,
  filters: DriverFilters = {},
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<DriverAnalysisContext> {
  const normalizedMetric = normalizeMetric(metric);
  const key = makeDriverCacheKey("context", {
    metric: normalizedMetric,
    period,
    region: filters.region,
    product: filters.product,
    channel: filters.channel,
  });

  return driverCache.getOrCompute(key, () =>
    buildDriverAnalysisContext(normalizedMetric, period, filters, config)
  );
}

async function buildDriverAnalysisContext(
  normalizedMetric: string,
  period: string,
  filters: DriverFilters,
  config: DriverConfig
): Promise<DriverAnalysisContext> {
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) throw new Error(`Unsupported metric: ${normalizedMetric}`);

  const previousPeriod = prevMonth(period);
  const drivers = getDriversForKPI(kpiDef.name);

  // Which dimensions this metric can actually be broken down by, given its source table.
  const supportedDimensions = CANDIDATE_DIMENSIONS.filter((d) =>
    driverSupportsDimension(normalizedMetric, d)
  );

  // Segment consistency needs a dimension that still VARIES under the current
  // filters. Filtering to a single region collapses the region breakdown to one
  // segment, which would make every driver look unmeasurable rather than
  // inconsistent. Pick the finest dimension not pinned by a filter.
  const segmentationDimension: BreakdownDimension =
    !filters.region && driverSupportsDimension(normalizedMetric, "region")
      ? "region"
      : !filters.product && driverSupportsDimension(normalizedMetric, "product")
        ? "product"
        : !filters.channel && driverSupportsDimension(normalizedMetric, "channel")
          ? "channel"
          : "region";

  // One pass over everything expensive. All of these ultimately share the same
  // small set of batched aggregate queries via the history layer's cache.
  const [history, contributions, dimensionGroups, associations, temporalAlignments, segmentConsistency] =
    await Promise.all([
      getDriverHistory(normalizedMetric, [previousPeriod, period], filters),
      calculateDriverContributions(normalizedMetric, period, filters),
      Promise.all(
        supportedDimensions.map(async (d) => {
          try {
            return await calculateDimensionContribution(normalizedMetric, period, d, filters);
          } catch {
            return [] as DimensionContribution[];
          }
        })
      ),
      calculateAllAssociations(kpiDef.name, period, filters, config),
      calculateAllTemporalAlignments(
        kpiDef.name,
        drivers.map((d) => d.id),
        period,
        filters,
        config
      ),
      calculateAllSegmentConsistency(kpiDef.name, period, segmentationDimension, filters, config),
    ]);

  // Contradictions are derived from the results above -- no requerying.
  const contradictions = deriveContradictions(associations, segmentConsistency, config);

  const currentValue = history.periods.find((p) => p.period === period)?.value ?? 0;
  const previousValue = history.periods.find((p) => p.period === previousPeriod)?.value ?? 0;
  const totalChange = currentValue - previousValue;
  const totalChangePct = previousValue !== 0 ? (totalChange / previousValue) * 100 : 0;

  const unsupportedDrivers = drivers
    .filter((d) => !isDriverHistorySupported(d.id))
    .map((d) => ({
      driver: d.id,
      reason: UNSUPPORTED_DRIVERS[d.id] ?? `No history resolver is defined for driver "${d.id}".`,
    }));

  return {
    metric: normalizedMetric,
    period,
    previousPeriod,
    filters,
    kpiDef,
    config,
    drivers,
    currentValue,
    previousValue,
    totalChange,
    totalChangePct,
    contributions,
    dimensions: dimensionGroups.flat(),
    segmentationDimension,
    associations,
    temporalAlignments,
    segmentConsistency,
    contradictions,
    unsupportedDrivers,
  };
}
