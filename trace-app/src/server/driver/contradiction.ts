import type { Contradiction, DriverHypothesis } from "./types";
import { getDriverDefinition, getDriversForKPI } from "./definitions";
import { calculateAssociation } from "./association";
import { calculateDimensionContribution } from "./contribution";
import { getKPIDefinition } from "../kpi/definitions";

export async function detectContradictions(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<Contradiction[]> {
  const kpiDef = getKPIDefinition(metric);
  if (!kpiDef) return [];
  
  const drivers = getDriversForKPI(kpiDef.name);
  const contradictions: Contradiction[] = [];
  
  for (const driver of drivers) {
    const def = getDriverDefinition(driver.id);
    if (!def) continue;
    
    const association = await calculateAssociation(metric, driver.id, period, filters);
    if (!association) continue;
    
    const expectedDirection = def.expectedDirection;
    const observedCorrelation = association.pearsonR;
    const observedDirection = observedCorrelation > 0 ? "positive" : "negative";
    
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
    
    const dimensionContribs = await calculateDimensionContribution(driver.id, period, "region", filters);
    for (const dim of dimensionContribs) {
      const driverDim = await calculateDimensionContribution(driver.id, period, "region", filters);
      const driverValue = driverDim.find(d => d.dimensionValue === dim.dimensionValue)?.change || 0;
      const metricValue = dim.change;
      
      if ((metricValue > 0 && driverValue < 0) || (metricValue < 0 && driverValue > 0)) {
        contradictions.push({
          driver: driver.id,
          metric: `${driver.name} in ${dim.dimensionValue}`,
          expectedDirection: def.expectedDirection,
          observedDirection: driverValue > 0 ? "positive" : "negative",
          effect: "weakens",
          magnitude: Math.abs(metricValue),
        });
      }
    }
  }
  
  return contradictions;
}