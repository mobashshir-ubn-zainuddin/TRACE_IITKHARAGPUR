import { getDB } from "../db";
import { getKPIHistoryBatched, getKPIBreakdown } from "../kpi";
import type { DimensionContribution, DriverContribution } from "./types";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { monthToDateRange, prevMonth } from "../utils/dateUtils";

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
  
  // Get current period breakdown
  const currentBreakdown = await getKPIBreakdown(metric, period, dimension, filters);
  
  // Get previous period breakdown
  const prevPeriod = getPreviousPeriod(period);
  const prevBreakdown = await getKPIBreakdown(metric, prevPeriod, dimension, filters);
  
  // Build maps for current and previous
  const currentMap = new Map(currentBreakdown.map(b => [b.dimensionValue, b.value]));
  const prevMap = new Map(prevBreakdown.map(b => [b.dimensionValue, b.value]));
  
  // Get all dimension values
  const allDimensionValues = new Set([...currentMap.keys(), ...prevMap.keys()]);
  
  // Calculate total change for contribution percentage
  const totalChange = [...currentMap.values()].reduce((sum, v) => sum + v, 0) - 
                      [...prevMap.values()].reduce((sum, v) => sum + v, 0);
  
  return [...allDimensionValues].map(dimensionValue => {
    const currentValue = currentMap.get(dimensionValue) || 0;
    const prevValue = prevMap.get(dimensionValue) || 0;
    const change = currentValue - prevValue;
    const changePct = prevValue !== 0 ? ((currentValue - prevValue) / prevValue) * 100 : 0;
    const contributionPct = totalChange !== 0 ? (change / totalChange) * 100 : 0;
    
    return {
      dimension: dimensionValue,
      dimensionValue: dimensionValue,
      change,
      changePct,
      contributionPct,
    };
  });
}

export async function calculateDriverContributions(
  metric: string,
  period: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<DriverContribution[]> {
  const normalizedMetric = metric.toLowerCase();
  const { computeKPI } = await import("../kpi");
  const prevPeriod = getPreviousPeriod(period);
  const filterOpts = { region: filters?.region, product: filters?.product, channel: filters?.channel };

  if (normalizedMetric === "revenue") {
    const currentKPI = await computeKPI("revenue", period, filters);
    const prevKPI = await computeKPI("revenue", prevPeriod, filters);
    
    const revenueChange = currentKPI.value - prevKPI.value;

    const currentOrders = await computeKPI("orders", period, filters);
    const prevOrders = await computeKPI("orders", prevPeriod, filters);
    const currentAOV = await computeKPI("aov", period, filters);
    const prevAOV = await computeKPI("aov", prevPeriod, filters);

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

  if (normalizedMetric === "orders") {
    const currentOrders = await computeKPI("orders", period, filters);
    const prevOrders = await computeKPI("orders", prevPeriod, filters);
    const currentConversion = await computeKPI("conversion", period, filterOpts);
    const prevConversion = await computeKPI("conversion", prevPeriod, filterOpts);
    
    const ordersChange = currentOrders.value - prevOrders.value;
    const ordersChangePct = prevOrders.value !== 0 ? (ordersChange / prevOrders.value) * 100 : 0;

    // Orders = Sessions * Conversion Rate / 100
    // We need sessions data - for now, use a simple approximation
    // Orders change = Sessions effect + Conversion effect
    const sessionsEffect = 0; // Would need sessions KPI
    const conversionEffect = ordersChange; // Approximation
    
    const total = Math.abs(sessionsEffect) + Math.abs(conversionEffect);
    
    return [
      {
        driver: "sessions",
        contributionPct: total !== 0 ? (Math.abs(sessionsEffect) / total) * 100 : 0,
        change: 0,
        changePct: 0,
      },
      {
        driver: "conversion",
        contributionPct: total !== 0 ? (Math.abs(conversionEffect) / total) * 100 : 0,
        change: currentConversion.value - prevConversion.value,
        changePct: prevConversion.value !== 0 ? ((currentConversion.value - prevConversion.value) / prevConversion.value) * 100 : 0,
      },
    ];
  }

  if (normalizedMetric === "aov") {
    const currentAOV = await computeKPI("aov", period, filters);
    const prevAOV = await computeKPI("aov", prevPeriod, filters);
    const currentRevenue = await computeKPI("revenue", period, filters);
    const prevRevenue = await computeKPI("revenue", prevPeriod, filters);
    const currentOrders = await computeKPI("orders", period, filters);
    const prevOrders = await computeKPI("orders", prevPeriod, filters);
    
    const aovChange = currentAOV.value - prevAOV.value;
    const aovChangePct = prevAOV.value !== 0 ? (aovChange / prevAOV.value) * 100 : 0;
    
    // AOV = Revenue / Orders
    // AOV change comes from Revenue effect + Orders effect
    const revenueEffect = (currentRevenue.value - prevRevenue.value) / prevOrders.value;
    const ordersEffect = prevRevenue.value * (1/prevOrders.value - 1/currentOrders.value);
    const interaction = aovChange - revenueEffect - ordersEffect;
    
    const total = Math.abs(revenueEffect) + Math.abs(ordersEffect) + Math.abs(interaction);
    
    return [
      {
        driver: "revenue",
        contributionPct: total !== 0 ? (Math.abs(revenueEffect) / total) * 100 : 0,
        change: currentRevenue.value - prevRevenue.value,
        changePct: prevRevenue.value !== 0 ? ((currentRevenue.value - prevRevenue.value) / prevRevenue.value) * 100 : 0,
      },
      {
        driver: "orders",
        contributionPct: total !== 0 ? (Math.abs(ordersEffect) / total) * 100 : 0,
        change: currentOrders.value - prevOrders.value,
        changePct: prevOrders.value !== 0 ? ((currentOrders.value - prevOrders.value) / prevOrders.value) * 100 : 0,
      },
    ];
  }

  return [];
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