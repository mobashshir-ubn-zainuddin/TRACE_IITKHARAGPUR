import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";
import { computeKPI } from "../kpi";
import { computeBaseline } from "./baseline";
import { detectAnomaly } from "./anomaly";
import { detectSeasonality } from "./seasonality";
import { calculateMateriality } from "./materiality";
import { calculateSignalScore } from "./scoring";
import { getSignalConfig } from "./config";
import { getKPIHistory } from "../kpi";
import type { KPISignal, SourceFreshness, SignalReasonCode } from "../types";
import type { SourceFreshness as KPISourceFreshness } from "../kpi/freshness";

export async function generateSignal(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<KPISignal> {
  const startTime = Date.now();
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const filterOpts = { region: filters?.region, product: filters?.product, channel: filters?.channel };
  
  // Get current KPI
  const kpiResponse = await computeKPI(normalizedMetric, period, filterOpts);
  
  // Get historical baseline
  const config = getSignalConfig();
  const baseline = await computeBaseline(normalizedMetric, period, config.baselineWindowMonths, filterOpts);
  
  // Detect anomaly
  const anomaly = await detectAnomaly(kpiResponse, filterOpts);
  
  // Detect seasonality
  const seasonality = await detectSeasonality(normalizedMetric, period, filterOpts);
  
  // Calculate materiality
  const materiality = calculateMateriality(normalizedMetric, kpiResponse.value, kpiResponse.previousValue, kpiResponse.changePct);
  
  // Get history for confidence calculation
  const history = await getKPIHistory(normalizedMetric, filters);
  const historyLength = history.length;
  
  // Get quality and freshness
  const { computeDataQuality } = await import("../kpi/quality");
  const { computeFreshness } = await import("../kpi/freshness");
  
  const quality = await computeDataQuality();
  const freshness = await computeFreshness(normalizedMetric);
  const relevantFreshness: SourceFreshness = (freshness[0] ? { 
    source: freshness[0].source,
    sourceType: freshness[0].sourceType,
    grain: freshness[0].grain,
    refreshCadence: freshness[0].refreshCadence,
    lastRefreshedAt: freshness[0].lastRefreshedAt,
    freshnessStatus: freshness[0].freshnessStatus,
    hoursSinceRefresh: freshness[0].hoursSinceRefresh,
    status: freshness[0].freshnessStatus
  } : { 
    source: 'unknown', 
    sourceType: 'unknown', 
    grain: 'unknown', 
    refreshCadence: 'unknown', 
    lastRefreshedAt: new Date().toISOString(), 
    freshnessStatus: 'critical' as const, 
    hoursSinceRefresh: 0,
    status: 'critical' as const
  }) as SourceFreshness;
  
  // Calculate signal score
  const scoring = calculateSignalScore(
    kpiResponse,
    { isAnomaly: anomaly.isAnomaly, zScore: anomaly.zScore, robustZScore: anomaly.robustZScore, statisticalSignificance: anomaly.statisticalSignificance },
    quality,
    relevantFreshness,
    materiality,
    historyLength
  );

  const signalId = `${normalizedMetric}-${period}-${filters?.region || 'all'}-${filters?.product || 'all'}-${filters?.channel || 'all'}`;

  const signal: KPISignal = {
    id: signalId,
    metric: normalizedMetric,
    period,
    currentValue: kpiResponse.value,
    previousValue: kpiResponse.previousValue,
    absoluteChange: kpiResponse.value - kpiResponse.previousValue,
    changePct: kpiResponse.changePct,
    baseline: {
      mean: baseline.mean,
      median: baseline.median,
      stdDev: baseline.stdDev,
      mad: baseline.mad,
      percentiles: baseline.percentiles,
    },
    deviation: {
      zScore: anomaly.zScore,
      robustZScore: anomaly.robustZScore,
    },
    seasonality: {
      adjusted: seasonality.adjusted,
      yoyChangePct: seasonality.yoyChangePct,
    },
    statisticalSignificance: anomaly.statisticalSignificance,
    materiality: materiality.level,
    signalStrength: scoring.signalStrength,
    priority: scoring.priority,
    status: scoring.status,
    confidence: scoring.confidence,
    dataQualityImpact: scoring.dataQualityImpact,
    reasons: scoring.reasons,
    reasonCodes: scoring.reasonCodes as SignalReasonCode[],
    explanation: scoring.explanation,
    dimensions: { 
      region: filters?.region || "", 
      product: filters?.product || "", 
      channel: filters?.channel || "" 
    },
    candidateInvestigationWindow: {
      start: `${period}-01`,
      end: `${period}-31`
    },
    telemetry: {
      calculationLatencyMs: Date.now() - startTime,
      historyLength: history.length,
      method: ["mom", "zscore", "yoy", "materiality", "quality", "freshness"],
    },
  };

  return signal;
}

export async function getTopSignals(
  period: string,
  limit: number = 10
): Promise<Array<{ metric: string; dimension: string; changePct: number; priority: string; signalStrength: number }>> {
  const metrics = getAllKPIMetrics();
  const signals: Array<{ metric: string; dimension: string; changePct: number; priority: string; signalStrength: number }> = [];

  for (const metric of metrics) {
    try {
      const signal = await generateSignal(metric, period);
      signals.push({
        metric: signal.metric,
        dimension: signal.dimensions?.region || "all",
        changePct: signal.changePct,
        priority: signal.priority,
        signalStrength: signal.signalStrength,
      });
    } catch {
      // Skip metrics that fail
    }
  }

  // Sort by signal strength descending
  signals.sort((a, b) => b.signalStrength - a.signalStrength);
  
  return signals.slice(0, limit);
}

export async function getSignalHistory(
  metric: string,
  filters?: { region?: string; product?: string; start?: string; end?: string }
): Promise<Array<{ period: string; signalStrength: number; status: string }>> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const months = filters?.start && filters?.end 
    ? getMonthsInRange(filters.start, filters.end)
    : getLastNMonths(12);

  const results = [];
  for (const month of months) {
    try {
      const signal = await generateSignal(normalizedMetric, month, { 
        region: filters?.region, 
        product: filters?.product 
      });
      results.push({ 
        period: month, 
        signalStrength: signal.signalStrength, 
        status: signal.status 
      });
    } catch {
      results.push({ period: month, signalStrength: 0, status: "normal" });
    }
  }
  return results;
}

// Helper functions
function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

function getMonthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      months.push(`${y}-${m.toString().padStart(2, "0")}`);
    }
  }
  return months;
}