import { getKPIDefinition } from "../kpi/definitions";
import { getSignalConfig } from "./config";

export interface SeasonalityResult {
  adjusted: boolean;
  yoyChangePct?: number;
  seasonalBaseline?: number;
  momChangePct: number;
}

export async function detectSeasonality(
  metric: string,
  period: string,
  _filters?: { region?: string; product?: string; channel?: string }
): Promise<SeasonalityResult> {
  const config = getSignalConfig();
  if (!config.seasonality.enabled) {
    return { adjusted: false, momChangePct: 0 };
  }

  const def = getKPIDefinition(metric);
  if (!def) return { adjusted: false, momChangePct: 0 };

  const { computeKPI } = await import("../kpi");

  // Get current period value
  const currentKPI = await computeKPI(metric, period);
  const momChangePct = currentKPI.changePct;

  // Get YoY comparison if we have enough history (12+ months)
  const currentYear = parseInt(period.split("-")[0]);
  const prevYear = currentYear - 1;
  const prevYearPeriod = `${prevYear}-${period.split("-")[1]}`;

  try {
    const currentKPI = await computeKPI(metric, period);
    const prevYearKPI = await computeKPI(metric, prevYearPeriod);
    
    if (prevYearKPI.value > 0) {
      const yoyChangePct = ((currentKPI.value - prevYearKPI.value) / prevYearKPI.value) * 100;
      return { 
        adjusted: true, 
        yoyChangePct,
        momChangePct: currentKPI.changePct,
        seasonalBaseline: prevYearKPI.value
      };
    }
  } catch {
    // Ignore errors, return unadjusted
  }

  return { adjusted: false, momChangePct: currentKPI.changePct };
}

export function isSeasonalPattern(
  momChangePct: number,
  yoyChangePct: number | undefined,
  _threshold: number = 5
): boolean {
  if (yoyChangePct === undefined) return false;
  
  // If MoM is negative but YoY is positive, likely seasonal
  if (momChangePct < 0 && yoyChangePct > 0) {
    return true;
  }
  
  // If both MoM and YoY are negative but YoY is less negative, could be seasonal
  if (momChangePct < 0 && yoyChangePct < 0 && Math.abs(yoyChangePct) < Math.abs(momChangePct)) {
    return true;
  }
  
  return false;
}