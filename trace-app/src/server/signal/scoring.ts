import { getSignalConfig } from "./config";
import { AnomalyResult } from "./anomaly";
import { KPIResponse, MaterialityResult, DataQualityResult, SourceFreshness } from "../types";

export interface ScoringResult {
  signalStrength: number;
  priority: "low" | "medium" | "high" | "critical";
  status: "normal" | "watch" | "investigate" | "urgent";
  confidence: number;
  dataQualityImpact: number;
  reasonCodes: string[];
  reasons: string[];
  explanation: {
    summary: {
      direction: "up" | "down" | "flat";
      magnitudePct: number;
      materiality: "low" | "medium" | "high";
      statisticalSignificance: "none" | "low" | "medium" | "high";
    };
    reasons: string[];
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface AnomalyForScoring {
  isAnomaly: boolean;
  zScore?: number;
  robustZScore?: number;
  statisticalSignificance: "none" | "low" | "medium" | "high";
  deviationPct?: number;
}

interface MaterialityForScoring {
  level: "low" | "medium" | "high";
  absoluteImpact: number;
  relativeImpact: number;
  exceedsAbsoluteThreshold: boolean;
  exceedsRelativeThreshold: boolean;
}

interface QualityForScoring {
  status: "good" | "warning" | "critical";
  completenessPct: number;
}

interface FreshnessForScoring {
  status: "fresh" | "stale" | "critical";
}

function calculateStatisticalScore(anomaly: AnomalyResult): number {
  if (!anomaly.isAnomaly) return 0;
  
  const absZ = Math.abs(anomaly.zScore ?? 0);
  const absRobustZ = Math.abs(anomaly.robustZScore ?? 0);
  const maxAbsZ = Math.max(absZ, absRobustZ);
  
  if (maxAbsZ >= 3) return 1.0;
  if (maxAbsZ >= 2.5) return 0.85;
  if (maxAbsZ >= 2) return 0.7;
  if (maxAbsZ >= 1.5) return 0.5;
  if (maxAbsZ >= 1) return 0.3;
  return 0.1;
}

function calculateMaterialityScore(materiality: MaterialityResult): number {
  switch (materiality.level) {
    case "high": return 1.0;
    case "medium": return 0.6;
    case "low": return 0.2;
    default: return 0;
  }
}

function calculateHistoricalConfidence(historyLength: number): number {
  if (historyLength >= 12) return 1.0;
  if (historyLength >= 6) return 0.8;
  if (historyLength >= 3) return 0.5;
  return 0.2;
}

function calculateDataQualityScore(quality: DataQualityResult, freshness: SourceFreshness): number {
  let score = 1.0;
  
  if (quality.status === "warning") score *= 0.8;
  if (quality.status === "critical") score *= 0.5;
  
  if (freshness.status === "stale") score *= 0.7;
  if (freshness.status === "critical") score *= 0.4;
  
  return Math.max(0, Math.min(1, score));
}

function calculateSeasonalityScore(seasonality: { adjusted: boolean; yoyChangePct?: number }): number {
  if (!seasonality.adjusted) return 0.5;
  if (seasonality.yoyChangePct !== undefined) {
    return 0.3;
  }
  return 0.7;
}

export function calculateSignalScore(
  kpiResponse: KPIResponse,
  anomaly: AnomalyResult,
  quality: DataQualityResult,
  freshness: SourceFreshness,
  materiality: MaterialityResult,
  historyLength: number
): import("./types").ScoringResult {
  
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function calculateStatisticalScore(anomaly: AnomalyResult): number {
    if (!anomaly.isAnomaly) return 0;
    
    const absZ = Math.abs(anomaly.zScore ?? 0);
    const absRobustZ = Math.abs(anomaly.robustZScore ?? 0);
    const maxAbsZ = Math.max(absZ, absRobustZ);
    
    if (maxAbsZ >= 3) return 1.0;
    if (maxAbsZ >= 2.5) return 0.85;
    if (maxAbsZ >= 2) return 0.7;
    if (maxAbsZ >= 1.5) return 0.5;
    if (maxAbsZ >= 1) return 0.3;
    return 0.1;
  }

  function calculateMaterialityScore(materiality: MaterialityResult): number {
    switch (materiality.level) {
      case "high": return 1.0;
      case "medium": return 0.6;
      case "low": return 0.2;
      default: return 0;
    }
  }

  function calculateHistoricalConfidence(historyLength: number): number {
    if (historyLength >= 12) return 1.0;
    if (historyLength >= 6) return 0.8;
    if (historyLength >= 3) return 0.5;
    return 0.2;
  }

  function calculateDataQualityScore(quality: DataQualityResult, freshness: SourceFreshness): number {
    let score = 1.0;
    
    if (quality.status === "warning") score *= 0.8;
    if (quality.status === "critical") score *= 0.5;
    
    if (freshness.status === "stale") score *= 0.7;
    if (freshness.status === "critical") score *= 0.4;
    
    return Math.max(0, Math.min(1, score));
  }

  function calculateSeasonalityScore(seasonality: { adjusted: boolean; yoyChangePct?: number }): number {
    if (!seasonality.adjusted) return 0.5;
    if (seasonality.yoyChangePct !== undefined) {
      return 0.3;
    }
    return 0.7;
  }

  const config = getSignalConfig();
  
  const statisticalScore = calculateStatisticalScore(anomaly);
  const materialityScore = calculateMaterialityScore(materiality);
  const historicalConfidence = calculateHistoricalConfidence(historyLength);
  const dataQualityScore = calculateDataQualityScore(quality, freshness);
  const seasonalityScore = calculateSeasonalityScore({ adjusted: false });

  const weights = config.signalWeights;
  
  const signalStrength = 
    config.signalWeights.statistical * statisticalScore +
    config.signalWeights.materiality * materialityScore +
    config.signalWeights.historicalConfidence * historicalConfidence +
    config.signalWeights.dataQuality * dataQualityScore +
    config.signalWeights.seasonality * seasonalityScore;

  const normalizedStrength = Math.max(0, Math.min(1, signalStrength));

  // Priority
  let priority: "low" | "medium" | "high" | "critical" = "low";
  if (normalizedStrength >= config.priorityThresholds.critical) priority = "critical";
  else if (normalizedStrength >= config.priorityThresholds.high) priority = "high";
  else if (normalizedStrength >= config.priorityThresholds.medium) priority = "high";
  else priority = "low";

  // Status
  let status: "normal" | "watch" | "investigate" | "urgent" = "normal";
  if (normalizedStrength >= config.statusThresholds.urgent) status = "urgent";
  else if (normalizedStrength >= config.statusThresholds.investigate) status = "investigate";
  else if (normalizedStrength >= config.statusThresholds.watch) status = "watch";
  else status = "normal";

  // Confidence calculation
  let confidence = normalizedStrength;
  
  // Apply penalties
  const penalties = config.confidencePenalties;
  if (quality.status === "warning") confidence -= penalties.lowCompleteness;
  if (quality.status === "critical") confidence -= penalties.lowCompleteness * 2;
  if (freshness.status === "stale") confidence -= penalties.staleData;
  if (freshness.status === "critical") confidence -= penalties.staleData * 2;
  if (historyLength < config.sparseHistory.minPeriods) confidence -= penalties.sparseHistory;
  
  confidence = Math.max(0, Math.min(1, confidence));

  // Data quality impact
  const dataQualityImpact = 1 - dataQualityScore;

  // Reason codes and reasons
  const reasonCodes: string[] = [];
  const reasons: string[] = [];

  if (Math.abs(kpiResponse.changePct) > 20) {
    reasonCodes.push("LARGE_MOM_CHANGE");
    reasons.push(`Month-over-month change of ${kpiResponse.changePct.toFixed(1)}% exceeds 20% threshold`);
  }

  if (materiality.exceedsAbsoluteThreshold || materiality.exceedsRelativeThreshold) {
    reasonCodes.push("HIGH_MATERIALITY");
    reasons.push(`Business materiality is ${materiality.level} (absolute: ${materiality.absoluteImpact.toFixed(0)}, relative: ${materiality.relativeImpact.toFixed(1)}%)`);
  }

  if (quality.status !== "good") {
    reasonCodes.push("LOW_COMPLETENESS");
    reasons.push(`Data quality is ${quality.status} (completeness: ${quality.completenessPct}%)`);
  }

  // Direction
  const direction = kpiResponse.changePct > 0 ? "up" : kpiResponse.changePct < 0 ? "down" : "flat";

  return {
    signalStrength: normalizedStrength,
    priority,
    status,
    confidence,
    dataQualityImpact: 1 - dataQualityScore,
    reasonCodes,
    reasons,
    explanation: {
      summary: {
        direction,
        magnitudePct: Math.abs(kpiResponse.changePct),
        materiality: materiality.level,
        statisticalSignificance: anomaly.statisticalSignificance,
      },
      reasons,
    },
  };
}