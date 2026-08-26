import { getDB } from "../db";
import { getKPIHistoryBatched, getKPIBreakdown } from "../kpi";
import type { SegmentConsistency, CounterSegmentComparison, DimensionContribution } from "./types";
import { getDriverDefinition, getDriversForKPI } from "./definitions";
import { DEFAULT_DRIVER_CONFIG } from "./config";
import { monthToDateRange, prevMonth } from "../utils/dateUtils";
import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";

function isValidKPIMetric(metric: string): boolean {
  const allMetrics = getAllKPIMetrics();
  return allMetrics.includes(metric.toLowerCase());
}

export async function calculateSegmentConsistency(
  metric: string,
  driver: string,
  period: string,
  dimension: "region" | "product" | "channel",
  filters?: { region?: string; product?: string; channel?: string }
): Promise<SegmentConsistency> {
  const config = DEFAULT_DRIVER_CONFIG;
  
  const prevPeriod = getPreviousPeriod(period);
  
  // Get current period breakdown
  const currentMetricBreakdown = await getKPIBreakdown(metric, period, dimension, filters);
  const currentDriverBreakdown = await getKPIBreakdown(driver, period, dimension, filters);
  
  // Get previous period breakdown
  const prevMetricBreakdown = await getKPIBreakdown(metric, prevPeriod, dimension, filters);
  const prevDriverBreakdown = await getKPIBreakdown(driver, prevPeriod, dimension, filters);
  
  // Build maps for current period
  const metricMap = new Map<string, number>(currentMetricBreakdown.map(b => [b.dimensionValue, b.value]));
  const driverMap = new Map<string, number>(currentDriverBreakdown.map(b => [b.dimensionValue, b.value]));
  
  // Build maps for previous period
  const prevMetricMap = new Map<string, number>(prevMetricBreakdown.map(b => [b.dimensionValue, b.value]));
  const prevDriverMap = new Map<string, number>(prevDriverBreakdown.map(b => [b.dimensionValue, b.value]));
  
  const segments = Array.from(metricMap.keys());
  
  if (segments.length < config.segmentConsistency.minSegmentsForConsistency) {
    return {
      driver,
      consistencyScore: 0,
      consistentSegments: [],
      inconsistentSegments: segments,
    };
  }
  
  let consistentCount = 0;
  const consistentSegments: string[] = [];
  const inconsistentSegments: string[] = [];
  
  for (const segment of segments) {
    const currentMetricValue = metricMap.get(segment) || 0;
    const currentDriverValue = driverMap.get(segment) || 0;
    const prevMetricValue = prevMetricMap.get(segment) || 0;
    const prevDriverValue = prevDriverMap.get(segment) || 0;
    
    const metricChange = currentMetricValue - prevMetricValue;
    const driverChange = currentDriverValue - prevDriverValue;
    
    // Get driver definition for expected direction
    const driverDef = getDriverDefinition(driver);
    const expectedDirection = driverDef?.expectedDirection || "positive";
    
    // Check consistency based on driver's expected direction
    // For positive driver: metric and driver should move in same direction
    // For negative driver: metric and driver should move in opposite directions
    const isConsistent = expectedDirection === "positive"
      ? (metricChange > 0 && driverChange > 0) || (metricChange < 0 && driverChange < 0)
      : (metricChange > 0 && driverChange < 0) || (metricChange < 0 && driverChange > 0);
    
    if (isConsistent) {
      consistentCount++;
      consistentSegments.push(segment);
    } else {
      inconsistentSegments.push(segment);
    }
  }
  
  const consistencyScore = segments.length > 0 ? consistentCount / segments.length : 0;
  
  return {
    driver,
    consistencyScore,
    consistentSegments,
    inconsistentSegments,
  };
}

export async function calculateCounterSegmentComparison(
  metric: string,
  driver: string,
  period: string,
  dimension: "region" | "product" | "channel",
  affectedSegments: string[],
  filters?: { region?: string; product?: string; channel?: string }
): Promise<CounterSegmentComparison> {
  const breakdown = await getKPIBreakdown(metric, period, dimension, {});
  const driverBreakdown = await getKPIBreakdown(driver, period, dimension, {});
  
  const metricMap = new Map<string, number>(breakdown.map(b => [b.dimensionValue, b.value]));
  const driverMap = new Map<string, number>(driverBreakdown.map(b => [b.dimensionValue, b.value]));
  
  const affected: { segment: string; change: number }[] = [];
  const unaffected: { segment: string; change: number }[] = [];
  
  for (const segment of affectedSegments) {
    const change = metricMap.get(segment) || 0;
    affected.push({ segment, change });
  }
  
  for (const [segment, value] of metricMap) {
    if (!affectedSegments.includes(segment)) {
      unaffected.push({ segment, change: value });
    }
  }
  
  const avgAffectedChange = affected.length > 0 
    ? affected.reduce((sum, a) => sum + a.change, 0) / affected.length 
    : 0;
  const avgUnaffectedChange = unaffected.length > 0
    ? unaffected.reduce((sum, a) => sum + a.change, 0) / unaffected.length
    : 0;
  
  const comparisonScore = avgUnaffectedChange !== 0 
    ? Math.abs(avgAffectedChange) / Math.abs(avgUnaffectedChange)
    : 1;
  
  return {
    driver,
    affectedSegments: affected,
    unaffectedSegments: unaffected,
    comparisonScore,
  };
}

export async function calculateAllSegmentConsistency(
  metric: string,
  period: string,
  dimension: "region" | "product" | "channel",
  filters?: { region?: string; product?: string; channel?: string }
): Promise<SegmentConsistency[]> {
  const kpiDef = getKPIDefinition(metric);
  
  if (!kpiDef) throw new Error(`Unknown metric: ${metric}`);
  
  const allDrivers = getDriversForKPI(kpiDef.name);
  const drivers = allDrivers.filter(d => isValidKPIMetric(d.id));
  const results: SegmentConsistency[] = [];
  
  for (const driver of drivers) {
    try {
      const result = await calculateSegmentConsistency(metric, driver.id, period, dimension, filters);
      results.push(result);
    } catch {
      results.push({
        driver: driver.id,
        consistencyScore: 0,
        consistentSegments: [],
        inconsistentSegments: [],
      });
    }
  }
  
  return results;
}

function getPreviousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}