import type { Contradiction } from "./types";
import { getDriverDefinition, getDriversForKPI } from "./definitions";
import { calculateAssociation } from "./association";
import { calculateDimensionContribution } from "./contribution";
import { getKPIBreakdown } from "../kpi";
import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";
import { monthToDateRange, prevMonth } from "../utils/dateUtils";

function isValidKPIMetric(metric: string): boolean {
  const allMetrics = getAllKPIMetrics();
  return allMetrics.includes(metric.toLowerCase());
}

export async function detectContradictions(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<Contradiction[]> {
  const kpiDef = getKPIDefinition(metric);
  if (!kpiDef) return [];
  
  const drivers = getDriversForKPI(kpiDef.name);
  const contradictions: Contradiction[] = [];
  
  // Pre-calculate KPI dimension contributions once
  const kpiDimensionContribs = await calculateDimensionContribution(metric, period, "region", filters);
  
  for (const driver of drivers) {
    const def = getDriverDefinition(driver.id);
    if (!def) continue;
    
    // Skip drivers that aren't valid KPI metrics
    if (!isValidKPIMetric(driver.id)) continue;
    
    const association = await calculateAssociation(metric, driver.id, period, filters);
    if (!association) continue;
    
    const expectedDirection = def.expectedDirection;
    const observedCorrelation = association.pearsonR;
    const observedDirection = observedCorrelation > 0 ? "positive" : "negative";
    
    // Check if correlation direction contradicts expected direction
    if (expectedDirection !== observedDirection && Math.abs(observedCorrelation) > 0.3) {
      contradictions.push({
        driver: driver.id,
        metric: driver.name,
        expectedDirection,
        observedDirection,
        effect: "weakens",
        magnitude: Math.abs(observedCorrelation),
      });
    }
    
    // Compare KPI dimension changes vs driver dimension changes
    let driverDimensionContribs: Awaited<ReturnType<typeof calculateDimensionContribution>>;
    try {
      driverDimensionContribs = await calculateDimensionContribution(driver.id, period, "region", filters);
    } catch {
      continue; // Skip if driver doesn't support dimension breakdown
    }
    
    for (const kpiDim of kpiDimensionContribs) {
      const driverDim = driverDimensionContribs.find(d => d.dimensionValue === kpiDim.dimensionValue);
      if (!driverDim) continue;
      
      const kpiChange = kpiDim.change;
      const driverChange = driverDim.change;
      
      // Check if directions are opposite (contradiction)
      if ((kpiChange > 0 && driverChange < 0) || (kpiChange < 0 && driverChange > 0)) {
        contradictions.push({
          driver: driver.id,
          metric: `${driver.name} in ${kpiDim.dimensionValue}`,
          expectedDirection: def.expectedDirection,
          observedDirection: driverChange > 0 ? "positive" : "negative",
          effect: "weakens",
          magnitude: Math.abs(kpiChange),
        });
      }
    }
  }
  
  return contradictions;
}