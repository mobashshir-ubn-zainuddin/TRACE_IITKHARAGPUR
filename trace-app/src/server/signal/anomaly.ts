import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { computeBaseline } from "./baseline";
import { getSignalConfig } from "./config";
import type { KPIResponse } from "../types";

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore?: number;
  robustZScore?: number;
  deviationPct?: number;
  statisticalSignificance: "none" | "low" | "medium" | "high";
}

export async function detectAnomaly(
  kpiResponse: KPIResponse,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<AnomalyResult> {
  // Calculate baseline from historical data
  const baseline = await computeBaseline(kpiResponse.metric, kpiResponse.period, getSignalConfig().baselineWindowMonths, filters);

  if (baseline.historyLength < getSignalConfig().minHistoryPeriods) {
    return {
      isAnomaly: false,
      statisticalSignificance: "none",
    };
  }

  // Calculate deviation from baseline mean
  const deviationPct = baseline.mean !== 0 
    ? ((kpiResponse.value - baseline.mean) / baseline.mean) * 100 
    : 0;

  // Standard z-score
  let zScore: number | undefined;
  if (baseline.stdDev > 0) {
    zScore = (kpiResponse.value - baseline.mean) / baseline.stdDev;
  }

  // Robust z-score using median and MAD
  let robustZScore: number | undefined;
  if (baseline.mad !== undefined && baseline.mad > 0) {
    robustZScore = 0.6745 * (kpiResponse.value - baseline.median) / baseline.mad;
  }

  // Determine statistical significance
  const absZ = Math.abs(zScore ?? 0);
  const absRobustZ = Math.abs(robustZScore ?? 0);
  
  let statisticalSignificance: "none" | "low" | "medium" | "high" = "none";
  const zThresholds = getSignalConfig().zScoreThresholds;
  
  const maxAbsZ = Math.max(absZ, absRobustZ);
  if (maxAbsZ >= zThresholds.high) {
    statisticalSignificance = "high";
  } else if (maxAbsZ >= zThresholds.medium) {
    statisticalSignificance = "medium";
  } else if (maxAbsZ >= zThresholds.low) {
    statisticalSignificance = "low";
  }

  // Check for seasonality-adjusted anomaly
  await detectSeasonality(kpiResponse.metric, kpiResponse.period, filters);
  
  const isAnomaly = 
    statisticalSignificance !== "none" && 
    (Math.abs(kpiResponse.changePct) > 5 || statisticalSignificance === "high");

  return {
    isAnomaly,
    zScore,
    robustZScore,
    deviationPct,
    statisticalSignificance,
  };
}

async function detectSeasonality(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<{ adjusted: boolean; yoyChangePct?: number }> {
  const config = getSignalConfig();
  if (!config.seasonality.enabled) {
    return { adjusted: false };
  }

  const def = getKPIDefinition(metric);
  if (!def) return { adjusted: false };

  // Get YoY comparison if we have enough history (12+ months)
  const currentYear = parseInt(period.split("-")[0]);
  const prevYear = currentYear - 1;
  const prevYearPeriod = `${prevYear}-${period.split("-")[1]}`;

  const { computeKPI } = await import("../kpi");
  
  try {
    const currentKPI = await computeKPI(metric, period);
    const prevYearKPI = await computeKPI(metric, prevYearPeriod);
    
    if (prevYearKPI.value > 0) {
      const yoyChangePct = ((currentKPI.value - prevYearKPI.value) / prevYearKPI.value) * 100;
      return { adjusted: true, yoyChangePct };
    }
  } catch {
    // Ignore errors, return unadjusted
  }

  return { adjusted: false };
}