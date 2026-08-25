export interface CachedKPIData {
  current: number;
  previous: number;
  changePct: number;
  value: number;
  period: string;
}

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

const kpiCache = new Map<string, CachedKPIData>();
const historyCache = new Map<string, Array<{ period: string; value: number }>>();
const baselineCache = new Map<string, BaselineResult>();

function makeKPIKey(metric: string, period: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:${period}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

function makeHistoryKey(metric: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:history:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

function makeBaselineKey(metric: string, period: string, windowMonths: number, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:baseline:${period}:${windowMonths}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

export function getCachedKPI(key: string): CachedKPIData | undefined {
  return kpiCache.get(key);
}

export function setCachedKPI(key: string, data: CachedKPIData): void {
  kpiCache.set(key, data);
}

export function getCachedHistory(key: string): Array<{ period: string; value: number }> | undefined {
  return historyCache.get(key);
}

export function setCachedHistory(key: string, data: Array<{ period: string; value: number }>): void {
  historyCache.set(key, data);
}

export function getCachedBaseline(key: string): BaselineResult | undefined {
  return baselineCache.get(key);
}

export function setCachedBaseline(key: string, data: BaselineResult): void {
  baselineCache.set(key, data);
}

export function clearCache(): void {
  kpiCache.clear();
  historyCache.clear();
  baselineCache.clear();
}

export { makeKPIKey, makeHistoryKey, makeBaselineKey };