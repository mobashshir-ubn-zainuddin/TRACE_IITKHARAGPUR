import { getKPIDefinition, normalizeMetric, getAllKPIMetrics } from "../kpi/definitions";
import { computeKPI, periodHasData } from "../kpi";
import { computeBaseline } from "./baseline";
import { calculateMateriality } from "./materiality";
import { calculateSignalScore } from "./scoring";
import { getSignalConfig } from "./config";
import { getKPIHistoryBatched } from "../kpi";
import type { KPISignal, SourceFreshness, SignalReasonCode, KPIResponse } from "../types";
import { 
  getCachedKPI, setCachedKPI, makeKPIKey,
  getCachedHistory, setCachedHistory, makeHistoryKey,
  getCachedBaseline, setCachedBaseline, makeBaselineKey,
  type BaselineResult
} from "./cache";
import { dataQualityCache, freshnessCache, makeDataQualityKey, makeFreshnessKey } from "./ttlCache";
import { 
  kpiInFlight, historyInFlight, baselineInFlight, signalInFlight,
  makeKPIInFlightKey, makeHistoryInFlightKey, makeBaselineInFlightKey, makeSignalInFlightKey
} from "./inFlight";
import { perfStart } from "./perf";

const signalCache = new Map<string, KPISignal>();

function makeSignalKey(metric: string, period: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:${period}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

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
  const signalKey = makeSignalKey(normalizedMetric, period, filters);
  
  // Check signal cache first
  const cachedSignal = signalCache.get(signalKey);
  if (cachedSignal) {
    return cachedSignal;
  }

  // In-flight deduplication for signal generation
  const signalInFlightKey = makeSignalInFlightKey(normalizedMetric, period, filterOpts);
  const endTotal = perfStart(`generateSignal ${normalizedMetric}`);
  return signalInFlight.getOrCreate(signalInFlightKey, async (abortSignal) => {
    // Check cache again inside the in-flight (another request might have completed)
    const cachedSignal = signalCache.get(signalKey);
    if (cachedSignal) {
      endTotal({ cached: true });
      return cachedSignal;
    }

    // Get current KPI (with caching + in-flight deduplication)
    const kpiKey = makeKPIKey(normalizedMetric, period, filterOpts);
    let kpiResponse = getCachedKPI(kpiKey);
    let fullKpiResponse: KPIResponse;
    if (!kpiResponse) {
      const kpiInFlightKey = makeKPIInFlightKey(normalizedMetric, period, filterOpts);
      const endKPI = perfStart(`computeKPI ${normalizedMetric}`);
      const result = await kpiInFlight.getOrCreate(kpiInFlightKey, async () => {
        return computeKPI(normalizedMetric, period, filterOpts);
      });
      endKPI({ metric: normalizedMetric });
      fullKpiResponse = result;
      setCachedKPI(kpiKey, {
        current: fullKpiResponse.value,
        previous: fullKpiResponse.previousValue,
        changePct: fullKpiResponse.changePct,
        value: fullKpiResponse.value,
        period: fullKpiResponse.period
      });
      kpiResponse = {
        current: fullKpiResponse.value,
        previous: fullKpiResponse.previousValue,
        changePct: fullKpiResponse.changePct,
        value: fullKpiResponse.value,
        period: fullKpiResponse.period
      };
    } else {
      // Reconstruct full KPIResponse from cached data
      fullKpiResponse = {
        metric: normalizedMetric,
        label: def.label,
        period: kpiResponse.period,
        month: kpiResponse.period,
        value: kpiResponse.value,
        previousValue: kpiResponse.previous,
        changePct: kpiResponse.changePct,
        unit: def.unit,
        dimensions: filterOpts,
        source: { table: def.source, columns: def.sourceColumns },
        lineage: { formula: def.formula, filters: { period, ...filterOpts }, generatedAt: new Date().toISOString() },
        quality: {
          completenessPct: 100,
          nullRatePct: 0,
          duplicateRatePct: 0,
          referentialIntegrityPct: 100,
          status: 'good' as const,
          details: {
            salesTransactions: { total: 0, nullNetRevenue: 0, nullOrderId: 0, duplicateTransactionId: 0, orphanRegionId: 0, orphanProductId: 0 },
            marketingDaily: { total: 0, nullSessions: 0, nullConversions: 0, orphanRegionId: 0, orphanProductId: 0 },
            operationsDaily: { total: 0, nullStockoutRate: 0, invalidStockoutRate: 0, orphanRegionId: 0, orphanProductId: 0 }
          }
        },
        freshness: {
          source: 'unknown',
          sourceType: 'unknown',
          grain: 'unknown',
          refreshCadence: 'unknown',
          lastRefreshedAt: new Date().toISOString(),
          freshnessStatus: 'fresh' as const,
          hoursSinceRefresh: 0,
          status: 'fresh' as const
        },
      } as KPIResponse;
    }

    // The KPI cache above doesn't carry `dataAvailable`, so re-derive it
    // directly (cheap COUNT query) rather than trusting a possibly-stale
    // reconstructed value. This is the signal-side half of the root-cause
    // fix: a requested period with zero underlying rows must never be
    // scored as a real movement (e.g. a fabricated -100%).
    const dataAvailable = fullKpiResponse.dataAvailable ?? await periodHasData(normalizedMetric, period, filterOpts);

    if (!dataAvailable) {
      const noDataSignal: KPISignal = {
        id: `${normalizedMetric}-${period}-${filters?.region || 'all'}-${filters?.product || 'all'}-${filters?.channel || 'all'}`,
        metric: normalizedMetric,
        period,
        currentValue: 0,
        previousValue: fullKpiResponse.previousValue,
        absoluteChange: 0,
        changePct: 0,
        baseline: { mean: 0, median: 0, stdDev: 0 },
        deviation: {},
        seasonality: { adjusted: false },
        statisticalSignificance: "none",
        materiality: "low",
        signalStrength: 0,
        priority: "low",
        status: "normal",
        confidence: 0,
        dataQualityImpact: 0,
        reasons: [`No data available for ${period}. This period has no underlying records, so no movement is reported (a missing period is not treated as a genuine zero).`],
        reasonCodes: ["NO_DATA_FOR_PERIOD"],
        explanation: {
          summary: { direction: "flat", magnitudePct: 0, materiality: "low", statisticalSignificance: "none" },
          reasons: [`No data available for ${period}.`],
        },
        dimensions: {
          region: filters?.region || "",
          product: filters?.product || "",
          channel: filters?.channel || "",
        },
        candidateInvestigationWindow: { start: `${period}-01`, end: `${period}-31` },
        telemetry: { calculationLatencyMs: Date.now() - startTime, historyLength: 0, method: ["no_data_guard"] },
        dataAvailable: false,
      };
      signalCache.set(signalKey, noDataSignal);
      endTotal({ dataAvailable: false });
      return noDataSignal;
    }

    // Get historical baseline (with caching + in-flight deduplication)
    const config = getSignalConfig();
    const baselineKey = makeBaselineKey(normalizedMetric, period, config.baselineWindowMonths, filterOpts);
    let baseline = getCachedBaseline(baselineKey);
    if (!baseline) {
      const baselineInFlightKey = makeBaselineInFlightKey(normalizedMetric, period, config.baselineWindowMonths, filterOpts);
      const endBaseline = perfStart(`computeBaseline ${normalizedMetric}`);
      baseline = await baselineInFlight.getOrCreate(baselineInFlightKey, async () => {
        return computeBaseline(normalizedMetric, period, config.baselineWindowMonths, filterOpts);
      }) as BaselineResult;
      endBaseline({ metric: normalizedMetric });
      setCachedBaseline(baselineKey, baseline);
    }
    
    // TypeScript knows baseline is defined here
    const resolvedBaseline = baseline as BaselineResult;
    
    // Detect anomaly using shared baseline
    const anomaly = await detectAnomalyWithBaseline(fullKpiResponse, filterOpts, resolvedBaseline);
    
    // Detect seasonality (with caching via baseline data)
    const endSeasonality = perfStart(`detectSeasonality ${normalizedMetric}`);
    const seasonality = await detectSeasonalityWithHistory(normalizedMetric, period, filterOpts);
    endSeasonality({ metric: normalizedMetric });
    
    // Calculate materiality
    const materiality = calculateMateriality(normalizedMetric, fullKpiResponse.value, fullKpiResponse.previousValue, fullKpiResponse.changePct);
    
    // Get history for confidence calculation (batched, with in-flight deduplication)
    const historyKey = makeHistoryKey(normalizedMetric, filterOpts);
    let history = getCachedHistory(historyKey);
    if (!history) {
      const historyInFlightKey = makeHistoryInFlightKey(normalizedMetric, filterOpts);
      const endHistory = perfStart(`getKPIHistoryBatched ${normalizedMetric}`);
      history = await historyInFlight.getOrCreate(historyInFlightKey, async () => {
        return getKPIHistoryBatched(normalizedMetric, getLastNMonths(12), filterOpts);
      }) as Array<{ period: string; value: number }>;
      endHistory({ metric: normalizedMetric });
      setCachedHistory(historyKey, history);
    }
    const resolvedHistory = history as Array<{ period: string; value: number }>;
    const historyLength = resolvedHistory.length;
    
    // Get quality and freshness (with TTL caching)
    const qualityKey = makeDataQualityKey();
    let quality = dataQualityCache.get(qualityKey);
    if (!quality) {
      const endQuality = perfStart(`computeDataQuality`);
      const { computeDataQuality } = await import("../kpi/quality");
      quality = await computeDataQuality();
      endQuality({});
      dataQualityCache.set(qualityKey, quality);
    }
    
    const freshnessKey = makeFreshnessKey(normalizedMetric);
    let freshness = freshnessCache.get(freshnessKey);
    if (!freshness) {
      const endFreshness = perfStart(`computeFreshness ${normalizedMetric}`);
      const { computeFreshness } = await import("../kpi/freshness");
      freshness = await computeFreshness(normalizedMetric);
      endFreshness({ metric: normalizedMetric });
      freshnessCache.set(freshnessKey, freshness);
    }
    
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
      fullKpiResponse,
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
      currentValue: fullKpiResponse.value,
      previousValue: fullKpiResponse.previousValue,
      absoluteChange: fullKpiResponse.value - fullKpiResponse.previousValue,
      changePct: fullKpiResponse.changePct,
      baseline: {
        mean: resolvedBaseline.mean,
        median: resolvedBaseline.median,
        stdDev: resolvedBaseline.stdDev,
        mad: resolvedBaseline.mad,
        percentiles: resolvedBaseline.percentiles,
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
        historyLength: resolvedHistory.length,
        method: ["mom", "zscore", "yoy", "materiality", "quality", "freshness"],
      },
    };

    // Cache the signal
    signalCache.set(signalKey, signal);
    return signal;
  });
}

// Modified anomaly detection that accepts pre-computed baseline
async function detectAnomalyWithBaseline(
  kpiResponse: KPIResponse,
  filters: { region?: string; product?: string; channel?: string } | undefined,
  baseline: BaselineResult
): Promise<{ isAnomaly: boolean; zScore?: number; robustZScore?: number; deviationPct?: number; statisticalSignificance: "none" | "low" | "medium" | "high" }> {
  const config = getSignalConfig();

  if (baseline.historyLength < config.minHistoryPeriods) {
    return {
      isAnomaly: false,
      statisticalSignificance: "none",
    };
  }

  const deviationPct = baseline.mean !== 0 
    ? ((kpiResponse.value - baseline.mean) / baseline.mean) * 100 
    : 0;

  let zScore: number | undefined;
  if (baseline.stdDev > 0) {
    zScore = (kpiResponse.value - baseline.mean) / baseline.stdDev;
  }

  let robustZScore: number | undefined;
  if (baseline.mad !== undefined && baseline.mad > 0) {
    robustZScore = 0.6745 * (kpiResponse.value - baseline.median) / baseline.mad;
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

// Modified seasonality detection that uses batched history
async function detectSeasonalityWithHistory(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<{ adjusted: boolean; yoyChangePct?: number; momChangePct: number }> {
  const config = getSignalConfig();
  if (!config.seasonality.enabled) {
    return { adjusted: false, momChangePct: 0 };
  }

  const def = getKPIDefinition(metric);
  if (!def) return { adjusted: false, momChangePct: 0 };

  // Use batched history to get current and YoY in one query
  const currentYear = parseInt(period.split("-")[0]);
  const prevYear = currentYear - 1;
  const prevYearPeriod = `${prevYear}-${period.split("-")[1]}`;
  
  const months = [period, prevYearPeriod];
  const history = await getKPIHistoryBatched(metric, months, filters);
  const historyMap = new Map(history.map(h => [h.period, h.value]));
  
  const currentValue = historyMap.get(period) || 0;
  const prevYearValue = historyMap.get(prevYearPeriod) || 0;
  
  const momChangePct = currentValue !== 0 ? ((currentValue - prevYearValue) / prevYearValue) * 100 : 0;
  
  if (prevYearValue > 0) {
    const yoyChangePct = ((currentValue - prevYearValue) / prevYearValue) * 100;
    return { 
      adjusted: true, 
      yoyChangePct,
      momChangePct: 0 // We don't have MoM here easily, but we can compute from history
    };
  }

  return { adjusted: false, momChangePct: 0 };
}

// Batch version of getTopSignals - computes all metrics in parallel
export async function getTopSignals(
  period: string,
  limit: number = 10
): Promise<Array<{ metric: string; dimension: string; changePct: number; priority: string; signalStrength: number }>> {
  const metrics = getAllKPIMetrics();

  // Controlled concurrency: process 2 metrics at a time to avoid DB contention
  const concurrency = 2;
  const signals: Array<{ metric: string; dimension: string; changePct: number; priority: string; signalStrength: number }> = [];
  
  for (let i = 0; i < metrics.length; i += concurrency) {
    const batch = metrics.slice(i, i + concurrency);
    const signalPromises = batch.map(async (metric) => {
      try {
        const signal = await generateSignal(metric, period);
        return {
          metric: signal.metric,
          dimension: signal.dimensions?.region || "all",
          changePct: signal.changePct,
          priority: signal.priority,
          signalStrength: signal.signalStrength,
        };
      } catch {
        return null;
      }
    });
    
    const results = await Promise.all(signalPromises);
    for (const s of results) {
      if (s) signals.push(s);
    }
  }
  
  signals.sort((a, b) => b.signalStrength - a.signalStrength);
  return signals.slice(0, limit);
}

// Batch version of getSignalHistory - computes all months in parallel
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

  // Compute all signals in parallel
  const signalPromises = months.map(async (month) => {
    try {
      const signal = await generateSignal(normalizedMetric, month, { 
        region: filters?.region, 
        product: filters?.product 
      });
      return { 
        period: month, 
        signalStrength: signal.signalStrength, 
        status: signal.status 
      };
    } catch {
      return { period: month, signalStrength: 0, status: "normal" };
    }
  });

  const results = await Promise.all(signalPromises);
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