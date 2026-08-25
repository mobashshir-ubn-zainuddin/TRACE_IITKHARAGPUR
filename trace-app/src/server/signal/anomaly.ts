import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import type { KPIResponse, BaselineResult } from "../types";
import { getSignalConfig } from "./config";

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore?: number;
  robustZScore?: number;
  deviationPct?: number;
  statisticalSignificance: "none" | "low" | "medium" | "high";
}

export async function detectAnomaly(
  kpiResponse: KPIResponse,
  filters?: { region?: string; product?: string; channel?: string },
  baseline?: BaselineResult
): Promise<AnomalyResult> {
  const config = getSignalConfig();

  // Use provided baseline or compute new one
  let computedBaseline = baseline;
  if (!computedBaseline) {
    const { computeBaseline } = await import("./baseline");
    computedBaseline = await computeBaseline(kpiResponse.metric, kpiResponse.period, config.baselineWindowMonths, filters);
  }

  if (computedBaseline.historyLength < config.minHistoryPeriods) {
    return {
      isAnomaly: false,
      statisticalSignificance: "none",
    };
  }

  const deviationPct = computedBaseline.mean !== 0 
    ? ((kpiResponse.value - computedBaseline.mean) / computedBaseline.mean) * 100 
    : 0;

  let zScore: number | undefined;
  if (computedBaseline.stdDev > 0) {
    zScore = (kpiResponse.value - computedBaseline.mean) / computedBaseline.stdDev;
  }

  let robustZScore: number | undefined;
  if (computedBaseline.mad !== undefined && computedBaseline.mad > 0) {
    robustZScore = 0.6745 * (kpiResponse.value - computedBaseline.median) / computedBaseline.mad;
  }

  const absZ = Math.abs(zScore ?? 0);
  const absRobustZ = Math.abs(robustZScore ?? 0);
  
  let statisticalSignificance: "none" | "low" | "medium" | "high" = "none";
  const zThresholds = config.zScoreThresholds;
  
  const maxAbsZ = Math.max(absZ, absRobustZ);
  if (maxAbsZ >= zThresholds.high) {
    statisticalSignificance = "high";
  } else if (maxAbsZ >= zThresholds.medium) {
    statisticalSignificance = "medium";
  } else if (maxAbsZ >= zThresholds.low) {
    statisticalSignificance = "low";
  }

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