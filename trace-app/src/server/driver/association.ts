import { getDB } from "../db";
import type { AssociationResult } from "./types";
import { DEFAULT_DRIVER_CONFIG } from "./config";

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

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;
  
  function rank(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && indexed[j].value === indexed[i].value) j++;
      const avgRank = (i + j + 1) / 2;
      for (let k = i; k < j; k++) {
        ranks[indexed[k].index] = avgRank;
      }
      i = j;
    }
    return ranks;
  }
  
  const rx = rank(x);
  const ry = rank(y);
  return pearsonCorrelation(rx, ry);
}

function getAssociationStrength(r: number): "none" | "weak" | "moderate" | "strong" {
  const absR = Math.abs(r);
  if (absR < 0.3) return "none";
  if (absR < 0.5) return "weak";
  if (absR < 0.7) return "moderate";
  return "strong";
}

export async function calculateAssociation(
  metric: string,
  driver: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<AssociationResult> {
  const { getKPIHistoryBatched } = await import("../kpi");
  const { getKPIHistory } = await import("../kpi");
  
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
    .map(h => h.period);
  
  if (commonPeriods.length < 6) {
    return {
      driver,
      pearsonR: 0,
      spearmanRho: 0,
      sampleSize: commonPeriods.length,
      associationStrength: "none",
    };
  }
  
  const x = commonPeriods.map(p => metricMap.get(p)!);
  const y = commonPeriods.map(p => driverMap.get(p)!);
  
  const pearsonR = pearsonCorrelation(x, y);
  const spearmanRho = spearmanCorrelation(x, y);
  
  return {
    driver,
    pearsonR,
    spearmanRho,
    sampleSize: commonPeriods.length,
    associationStrength: getAssociationStrength(Math.max(Math.abs(pearsonR), Math.abs(spearmanRho))),
  };
}

export async function calculateAllAssociations(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<AssociationResult[]> {
  const { getDriverDefinition, getDriversForKPI } = await import("./definitions");
  const kpiDef = await import("../kpi/definitions").then(m => m.getKPIDefinition(metric));
  
  if (!kpiDef) throw new Error(`Unknown metric: ${metric}`);
  
  const drivers = getDriversForKPI(kpiDef.name);
  const results: AssociationResult[] = [];
  
  for (const driver of drivers) {
    try {
      const result = await calculateAssociation(kpiDef.name, driver.id, period, {});
      results.push(result);
    } catch (e) {
      results.push({
        driver: driver.name,
        pearsonR: 0,
        spearmanRho: 0,
        sampleSize: 0,
        associationStrength: "none",
      });
    }
  }
  
  return results;
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