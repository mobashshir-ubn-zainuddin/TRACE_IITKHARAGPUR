import { getDB } from "../db";
import { getKPIHistoryBatched } from "../kpi";
import type { TemporalAlignment } from "./types";
import { DEFAULT_DRIVER_CONFIG } from "./config";

export async function calculateTemporalAlignment(
  metric: string,
  driver: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<TemporalAlignment> {
  const { getKPIHistoryBatched } = await import("../kpi");
  
  const normalizedMetric = metric.toLowerCase();
  const months = await getMonthsForPeriod(period, 12);
  
  const [metricHistory, driverHistory] = await Promise.all([
    getKPIHistoryBatched(metric, months, {}),
    getKPIHistoryBatched(driver, months, {}),
  ]);
  
  const metricMap = new Map(metricHistory.map(h => [h.period, h.value]));
  const driverMap = new Map(driverHistory.map(h => [h.period, h.value]));
  
  const commonPeriods = metricHistory
    .filter(h => driverMap.has(h.period))
    .map(h => h.period)
    .sort();
  
  if (commonPeriods.length < 3) {
    return {
      driver,
      bestLag: 0,
      lagCorrelation: 0,
      temporalScore: 0,
    };
  }
  
  const config = DEFAULT_DRIVER_CONFIG;
  const maxLag = config.temporalAlignment.maxLagMonths;
  
  let bestLag = 0;
  let bestCorrelation = 0;
  
  for (let lag = 0; lag <= maxLag; lag++) {
    const x: number[] = [];
    const y: number[] = [];
    
    for (const currentPeriod of commonPeriods) {
      const driverPeriod = getLaggedPeriod(currentPeriod, lag);
      const metricValue = metricMap.get(currentPeriod);
      const driverValue = driverMap.get(driverPeriod);
      
      if (metricValue !== undefined && driverValue !== undefined) {
        x.push(metricValue);
        y.push(driverValue);
      }
    }
    
    if (x.length >= 3) {
      const correlation = pearsonCorrelation(x, y);
      if (Math.abs(correlation) > Math.abs(bestCorrelation)) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
  }
  
  const temporalScore = Math.max(0, Math.abs(bestCorrelation));
  
  return {
    driver,
    bestLag,
    lagCorrelation: bestCorrelation,
    temporalScore,
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function getLaggedPeriod(period: string, lag: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 - lag, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function getMonthsForPeriod(endPeriod: string, monthsBack: number): Promise<string[]> {
  const months: string[] = [];
  const [year, month] = endPeriod.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}