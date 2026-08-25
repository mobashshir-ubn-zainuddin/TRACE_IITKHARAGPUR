import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { getKPIHistoryBatched } from "../kpi";

export interface BaselineResult {
  mean: number;
  median: number;
  stdDev: number;
  mad?: number;
  percentiles?: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  historyLength: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map(v => Math.abs(v - med));
  return median(deviations);
}

function stdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export async function computeBaseline(
  metric: string,
  period: string,
  windowMonths: number = 6,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<BaselineResult> {
  const normalizedMetric = normalizeMetric(metric);
  const def = getKPIDefinition(normalizedMetric);
  if (!def) {
    throw new Error(`Unsupported metric: ${metric}`);
  }

  const months = getTrailingMonths(period, windowMonths);

  const history = await getKPIHistoryBatched(
    normalizedMetric,
    months,
    filters
  );

  const values = history
    .map(item => item.value)
    .filter(value => Number.isFinite(value));

  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      historyLength: 0,
    };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const med = median(values);
  const stdDevValue = stdDev(values, mean);
  const madValue = mad(values);

  return {
    mean,
    median: med,
    stdDev: stdDevValue,
    mad: madValue,
    percentiles: {
      p10: percentile(values, 10),
      p25: percentile(values, 25),
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
    },
    historyLength: values.length,
  };
}

function getTrailingMonths(period: string, windowMonths: number): string[] {
  const [year, month] = period.split("-").map(Number);
  const months: string[] = [];
  const endDate = new Date(year, month - 1, 1);
  
  for (let i = windowMonths - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}