// src/server/kpi/index.ts
import { readJSON } from "../utils";

type KPIRecord = {
  month: string; // YYYY-MM
  region: string;
  product: string;
  revenue: number;
  orders: number;
  aov: number;
};

export type KPIResponse = {
  kpi: string; // e.g., "Revenue"
  month: string;
  value: number;
  change_pct: number; // month‑over‑month percent change
  is_anomaly: boolean;
  severity?: "low" | "medium" | "high";
};

/**
 * Compute the aggregate KPI for the given metric and month across all regions/products.
 * Supports "revenue", "orders", "aov".
 */
export async function computeKPI(metric: string, month: string): Promise<KPIResponse> {
  const data = await readJSON<KPIRecord[]>("kpis.json");
  const metricKey = metric.toLowerCase();
  if (!["revenue", "orders", "aov"].includes(metricKey)) {
    throw new Error(`Unsupported metric ${metric}`);
  }

  const monthData = data.filter((d) => d.month === month);
  const prevMonth = new Date(month + "-01");
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);
  const prevData = data.filter((d) => d.month === prevMonthStr);

  const sum = (arr: KPIRecord[]) =>
    arr.reduce((acc, cur) => acc + (cur as any)[metricKey], 0);

  const curValue = sum(monthData);
  const prevValue = sum(prevData) || 0;
  const changePct = prevValue === 0 ? 0 : ((curValue - prevValue) / prevValue) * 100;

  // Simple anomaly detection: flag if absolute change > 20% and Z‑score > 2
  const allValues = data.filter((d) => d.month === month).map((d) => (d as any)[metricKey]);
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const std = Math.sqrt(
    allValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allValues.length
  );
  const z = std === 0 ? 0 : (curValue - mean) / std;
  const isAnomaly = Math.abs(changePct) > 20 && Math.abs(z) > 2;
  const severity = Math.abs(changePct) > 30 ? "high" : Math.abs(changePct) > 20 ? "medium" : "low";

  return {
    kpi: metric.charAt(0).toUpperCase() + metric.slice(1),
    month,
    value: curValue,
    change_pct: Number(changePct.toFixed(2)),
    is_anomaly: isAnomaly,
    severity: isAnomaly ? (severity as any) : undefined,
  };
}
