import { getDB } from "../db";
import { getKPIHistoryBatched } from "../kpi";
import type { DimensionContribution, DriverContribution } from "./types";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";

export async function calculateRevenueDecomposition(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<{
  ordersContribution: number;
  aovContribution: number;
  interactionContribution: number;
  ordersContributionPct: number;
  aovContributionPct: number;
}> {
  const normalizedMetric = normalizeMetric(metric);
  
  if (normalizedMetric !== "revenue") {
    throw new Error("Revenue decomposition only available for revenue metric");
  }

  const { computeKPI } = await import("../kpi");
  
  const currentKPI = await computeKPI("revenue", period, filters);
  const prevPeriod = getPreviousPeriod(period);
  const previousKPI = await computeKPI("revenue", prevPeriod, filters);

  const currentOrders = await computeKPI("orders", period, filters);
  const prevOrders = await computeKPI("orders", prevPeriod, filters);
  const currentAOV = await computeKPI("aov", period, filters);
  const prevAOV = await computeKPI("aov", prevPeriod, filters);

  const revenueChange = currentKPI.value - previousKPI.value;
  
  const ordersEffect = (currentOrders.value - prevOrders.value) * prevAOV.value;
  const aovEffect = (currentAOV.value - prevAOV.value) * prevOrders.value;
  const interactionEffect = revenueChange - ordersEffect - aovEffect;

  const totalEffect = ordersEffect + aovEffect + interactionEffect;
  
  return {
    ordersContribution: ordersEffect,
    aovContribution: aovEffect,
    interactionContribution: interactionEffect,
    ordersContributionPct: totalEffect !== 0 ? (ordersEffect / totalEffect) * 100 : 0,
    aovContributionPct: totalEffect !== 0 ? (aovEffect / totalEffect) * 100 : 0,
  };
}

export async function calculateDimensionContribution(
  metric: string,
  period: string,
  dimension: "region" | "product" | "channel",
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DimensionContribution[]> {
  const { getKPIBreakdown } = await import("../kpi");
  
  const breakdown = await getKPIBreakdown(metric, period, dimension, filters);
  
  const total = breakdown.reduce((sum, item) => sum + item.value, 0);
  
  return breakdown.map(item => ({
    dimension: item.dimensionValue,
    dimensionValue: item.dimensionValue,
    change: item.value,
    changePct: 0,
    contributionPct: total !== 0 ? (item.value / total) * 100 : 0,
  }));
}

export async function calculateDriverContributions(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DriverContribution[]> {
  const normalizedMetric = metric.toLowerCase();
  
  if (normalizedMetric !== "revenue") {
    throw new Error("Driver contributions only implemented for revenue metric");
  }

  const { computeKPI } = await import("../kpi");
  const { getDB } = await import("../db");
  
  const db = await getDB();
  const currentKPI = await import("../kpi").then(m => m.computeKPI("revenue", period, {}));
  const prevPeriod = getPreviousPeriod(period);
  const prevKPI = await import("../kpi").then(m => m.computeKPI("revenue", prevPeriod, {}));
  
  const revenueChange = currentKPI.value - prevKPI.value;
  const revenueChangePct = prevKPI.value !== 0 ? ((currentKPI.value - prevKPI.value) / prevKPI.value) * 100 : 0;

  const currentOrders = await import("../kpi").then(m => m.computeKPI("orders", period, {}));
  const prevOrders = await import("../kpi").then(m => m.computeKPI("orders", prevPeriod, {}));
  const currentAOV = await import("../kpi").then(m => m.computeKPI("aov", period, {}));
  const prevAOV = await import("../kpi").then(m => m.computeKPI("aov", prevPeriod, {}));

  const ordersChange = currentOrders.value - prevOrders.value;
  const aovChange = currentAOV.value - prevAOV.value;

  const ordersContribution = ordersChange * prevAOV.value;
  const aovContribution = aovChange * prevOrders.value;
  const interaction = revenueChange - ordersContribution - aovContribution;

  const total = Math.abs(ordersContribution) + Math.abs(aovContribution) + Math.abs(interaction);
  
  const contributions: DriverContribution[] = [
    {
      driver: "orders",
      contributionPct: total !== 0 ? (Math.abs(ordersContribution) / total) * 100 : 0,
      change: ordersChange,
      changePct: prevOrders.value !== 0 ? (ordersChange / prevOrders.value) * 100 : 0,
    },
    {
      driver: "aov",
      contributionPct: total !== 0 ? (Math.abs(aovContribution) / total) * 100 : 0,
      change: aovChange,
      changePct: prevAOV.value !== 0 ? (aovChange / prevAOV.value) * 100 : 0,
    },
  ];

  if (Math.abs(interaction) > total * 0.05) {
    contributions.push({
      driver: "interaction",
      contributionPct: total !== 0 ? (Math.abs(interaction) / total) * 100 : 0,
      change: interaction,
      changePct: 0,
    });
  }

  return contributions;
}

export async function calculateRegionContribution(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "region", filters);
}

export async function calculateProductContribution(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "product", filters);
}

export async function calculateChannelContribution(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "channel", filters);
}

function getPreviousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getTotal(breakdown: Array<{ value: number }>): number {
  return breakdown.reduce((sum, item) => sum + item.value, 0);
}