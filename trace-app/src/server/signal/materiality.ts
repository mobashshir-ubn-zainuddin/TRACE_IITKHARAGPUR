import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { getSignalConfig } from "./config";

export type MaterialityLevel = "low" | "medium" | "high";

export interface MaterialityResult {
  level: MaterialityLevel;
  absoluteImpact: number;
  relativeImpact: number;
  exceedsAbsoluteThreshold: boolean;
  exceedsRelativeThreshold: boolean;
}

export function calculateMateriality(
  metric: string,
  currentValue: number,
  previousValue: number,
  changePct: number
): MaterialityResult {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  const config = getSignalConfig();

  if (!def) {
    return {
      level: "low",
      absoluteImpact: Math.abs(currentValue - previousValue),
      relativeImpact: Math.abs(changePct),
      exceedsAbsoluteThreshold: false,
      exceedsRelativeThreshold: false,
    };
  }

  const absoluteImpact = Math.abs(currentValue - previousValue);
  const relativeImpact = Math.abs(changePct);

  const threshold = config.materialityThresholds[normalizedMetric];
  const absoluteThreshold = threshold?.absolute ?? 0;
  const relativeThreshold = threshold?.relative ?? 0;

  const exceedsAbsoluteThreshold = absoluteImpact >= absoluteThreshold;
  const exceedsRelativeThreshold = relativeImpact >= relativeThreshold;

  let level: "low" | "medium" | "high" = "low";
  
  if (exceedsAbsoluteThreshold || exceedsRelativeThreshold) {
    // Determine materiality level based on thresholds
    if (absoluteImpact >= absoluteThreshold * 3 || relativeImpact >= relativeThreshold * 3) {
      level = "high";
    } else if (absoluteImpact >= absoluteThreshold * 1.5 || relativeImpact >= relativeThreshold * 1.5) {
      level = "medium";
    } else {
      level = "low";
    }
  }

  return {
    level,
    absoluteImpact,
    relativeImpact,
    exceedsAbsoluteThreshold,
    exceedsRelativeThreshold,
  };
}