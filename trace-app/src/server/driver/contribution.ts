import { getDB } from "../db";
import { getKPIHistoryBatched, getKPIBreakdown } from "../kpi";
import type { DimensionContribution, DriverContribution } from "./types";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { monthToDateRange, prevMonth } from "../utils/dateUtils";

const EPSILON = 1e-9;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Two-factor Shapley decomposition helper.
 * Given a function f(x1, x2) and values (x1_0, x2_0) and (x1_1, x2_1),
 * returns the Shapley contribution of each factor to the change f(x1_1, x2_1) - f(x1_0, x2_0).
 *
 * Factor 1 contribution = 0.5 * [f(x1_1, x2_0) - f(x1_0, x2_0) + f(x1_1, x2_1) - f(x1_0, x2_1)]
 * Factor 2 contribution = 0.5 * [f(x1_0, x2_1) - f(x1_0, x2_0) + f(x1_1, x2_1) - f(x1_1, x2_0)]
 */
function shapleyTwoFactorChange(
  f00: number,
  f10: number,
  f01: number,
  f11: number
): { factor1: number; factor2: number; totalChange: number; reconciliationError: number } {
  const factor1 = 0.5 * ((f10 - f00) + (f11 - f01));
  const factor2 = 0.5 * ((f01 - f00) + (f11 - f10));
  const totalChange = f11 - f00;
  const reconciliationError = totalChange - factor1 - factor2;
  
  return {
    factor1,
    factor2,
    totalChange,
    reconciliationError,
  };
}

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
  reconciliationError: number;
  reconciles: boolean;
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
  
  // Revenue = Orders × AOV
  // Use Shapley decomposition for exact two-factor decomposition
  const f00 = prevOrders.value * prevAOV.value;
  const f10 = currentOrders.value * prevAOV.value;
  const f01 = prevOrders.value * currentAOV.value;
  const f11 = currentOrders.value * currentAOV.value;
  
  const { factor1: ordersEffect, factor2: aovEffect, totalChange, reconciliationError } = 
    shapleyTwoFactorChange(f00, f10, f01, f11);
  
  const reconciles = Math.abs(reconciliationError) < EPSILON;
  
  const totalEffect = Math.abs(ordersEffect) + Math.abs(aovEffect);
  
  return {
    ordersContribution: ordersEffect,
    aovContribution: aovEffect,
    interactionContribution: 0, // No interaction residual with exact Shapley
    ordersContributionPct: totalEffect !== 0 ? (Math.abs(ordersEffect) / totalEffect) * 100 : 0,
    aovContributionPct: totalEffect !== 0 ? (Math.abs(aovEffect) / totalEffect) * 100 : 0,
    reconciliationError,
    reconciles,
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
    const changePct = prevValue !== 0 ? ((currentValue - prevValue) / prevValue) * 100 : null;
    const contributionPct = totalChange !== 0 ? (change / totalChange) * 100 : 0;
    const signedContributionPct = totalChange !== 0 ? (change / totalChange) * 100 : 0;
    const totalAbsChange = [...allDimensionValues].reduce((sum, dv) => {
      const cv = currentMap.get(dv) || 0;
      const pv = prevMap.get(dv) || 0;
      return sum + Math.abs(cv - pv);
    }, 0);
    const magnitudeContributionPct = totalAbsChange !== 0 ? (Math.abs(change) / totalAbsChange) * 100 : 0;
    
    return {
      dimension: dimensionValue,
      dimensionValue: dimensionValue,
      change,
      changePct,
      contributionPct,
      signedContributionPct,
      magnitudeContributionPct,
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

    // Orders = COUNT(DISTINCT order_id) - this is a fundamental KPI, not Sessions × Conversion
    // The marketing conversion rate is from a different data source (marketing_daily vs sales_transactions)
    // and measures conversions/sessions, not orders/sessions.
    // We cannot exactly decompose Orders into Sessions and Conversion.
    // Return statistical association indicators instead of exact decomposition.
    
    const conversionChange = currentConversion.value - prevConversion.value;
    const conversionChangePct = prevConversion.value !== 0 ? (conversionChange / prevConversion.value) * 100 : 0;
    
    return [
      {
        driver: "sessions",
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: "statistical" as const,
        change: 0, // No sessions KPI available
        changePct: 0,
        status: "not_exactly_decomposable",
        explanation: "Sessions is a marketing metric from a different data source; not an exact algebraic component of Orders KPI.",
      },
      {
        driver: "conversion",
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: "statistical" as const,
        change: conversionChange,
        changePct: conversionChangePct,
        status: "not_exactly_decomposable",
        explanation: "Conversion is statistically associated with Orders but is not an exact algebraic component (different data source: marketing_daily vs sales_transactions).",
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
    // Use Shapley decomposition for exact two-factor decomposition
    // Only valid when both previous and current orders > 0
    if (prevOrders.value <= 0 || currentOrders.value <= 0) {
      return [
        {
          driver: "revenue",
          contributionPct: null,
          signedContributionPct: null,
          magnitudeContributionPct: null,
          contributionType: "insufficient_data" as const,
          change: currentRevenue.value - prevRevenue.value,
          changePct: prevRevenue.value !== 0 ? ((currentRevenue.value - prevRevenue.value) / prevRevenue.value) * 100 : 0,
          status: "insufficient_data",
          explanation: "Cannot decompose AOV when orders is zero or negative.",
        },
        {
          driver: "orders",
          contributionPct: null,
          signedContributionPct: null,
          magnitudeContributionPct: null,
          contributionType: "insufficient_data" as const,
          change: currentOrders.value - prevOrders.value,
          changePct: prevOrders.value !== 0 ? ((currentOrders.value - prevOrders.value) / prevOrders.value) * 100 : 0,
          status: "insufficient_data",
          explanation: "Cannot decompose AOV when orders is zero or negative.",
        },
      ];
    }
    
    // AOV = Revenue / Orders
    // Use Shapley decomposition for exact two-factor decomposition
    const f00 = prevRevenue.value / prevOrders.value;
    const f10 = currentRevenue.value / prevOrders.value;
    const f01 = prevRevenue.value / currentOrders.value;
    const f11 = currentRevenue.value / currentOrders.value;
    
    const { factor1: revenueEffect, factor2: ordersEffect, totalChange, reconciliationError } = 
      shapleyTwoFactorChange(f00, f10, f01, f11);
    
    const reconciles = Math.abs(reconciliationError) < EPSILON;
    const totalEffect = Math.abs(revenueEffect) + Math.abs(ordersEffect);
    
    return [
      {
        driver: "revenue",
        contributionPct: totalEffect !== 0 ? (revenueEffect / totalChange) * 100 : 0,
        signedContributionPct: totalChange !== 0 ? (revenueEffect / totalChange) * 100 : 0,
        magnitudeContributionPct: totalEffect !== 0 ? (Math.abs(revenueEffect) / totalEffect) * 100 : 0,
        contributionType: "exact" as const,
        change: currentRevenue.value - prevRevenue.value,
        changePct: prevRevenue.value !== 0 ? ((currentRevenue.value - prevRevenue.value) / prevRevenue.value) * 100 : 0,
        status: "calculated",
        explanation: "Revenue effect on AOV via Shapley decomposition: AOV = Revenue / Orders.",
      },
      {
        driver: "orders",
        contributionPct: totalEffect !== 0 ? (ordersEffect / totalChange) * 100 : 0,
        signedContributionPct: totalChange !== 0 ? (ordersEffect / totalChange) * 100 : 0,
        magnitudeContributionPct: totalEffect !== 0 ? (Math.abs(ordersEffect) / totalEffect) * 100 : 0,
        contributionType: "exact" as const,
        change: currentOrders.value - prevOrders.value,
        changePct: prevOrders.value !== 0 ? ((currentOrders.value - prevOrders.value) / prevOrders.value) * 100 : 0,
        status: "calculated",
        explanation: "Orders effect on AOV via Shapley decomposition: AOV = Revenue / Orders.",
      },
    ];
  }

if (normalizedMetric === "marketingroi") {
    const currentROI = await computeKPI("marketingROI", period, filters);
    const prevROI = await computeKPI("marketingROI", prevPeriod, filters);
    const currentAttributedRevenue = await computeKPI("attributedRevenue", period, filters);
    const prevAttributedRevenue = await computeKPI("attributedRevenue", prevPeriod, filters);
    const currentSpend = await computeKPI("marketingSpend", period, filters);
    const prevSpend = await computeKPI("marketingSpend", prevPeriod, filters);
    
    const roiChange = currentROI.value - prevROI.value;
    
    // Marketing ROI = AttributedRevenue / MarketingSpend
    // Use Shapley decomposition for exact two-factor decomposition
    // Only valid when both previous and current spend > 0
    if (prevSpend.value <= 0 || currentSpend.value <= 0) {
      return [
        {
          driver: "attributedRevenue",
          contributionPct: null,
          signedContributionPct: null,
          magnitudeContributionPct: null,
          contributionType: "insufficient_data" as const,
          change: currentAttributedRevenue.value - prevAttributedRevenue.value,
          changePct: prevAttributedRevenue.value !== 0 ? ((currentAttributedRevenue.value - prevAttributedRevenue.value) / prevAttributedRevenue.value) * 100 : 0,
          status: "insufficient_data",
          explanation: "Cannot decompose Marketing ROI when marketing spend is zero or negative.",
        },
        {
          driver: "marketingSpend",
          contributionPct: null,
          signedContributionPct: null,
          magnitudeContributionPct: null,
          contributionType: "insufficient_data" as const,
          change: currentSpend.value - prevSpend.value,
          changePct: prevSpend.value !== 0 ? ((currentSpend.value - prevSpend.value) / prevSpend.value) * 100 : 0,
          status: "insufficient_data",
          explanation: "Cannot decompose Marketing ROI when marketing spend is zero or negative.",
        },
      ];
    }
    
    // ROI = AttributedRevenue / MarketingSpend
    // Use Shapley decomposition for exact two-factor decomposition
    const f00 = prevAttributedRevenue.value / prevSpend.value;
    const f10 = currentAttributedRevenue.value / prevSpend.value;
    const f01 = prevAttributedRevenue.value / currentSpend.value;
    const f11 = currentAttributedRevenue.value / currentSpend.value;
    
    const { factor1: attributedRevenueEffect, factor2: spendEffect, totalChange, reconciliationError } = 
      shapleyTwoFactorChange(f00, f10, f01, f11);
    
    const reconciles = Math.abs(reconciliationError) < EPSILON;
    const totalEffect = Math.abs(attributedRevenueEffect) + Math.abs(spendEffect);
    
    return [
      {
        driver: "attributedRevenue",
        contributionPct: totalEffect !== 0 ? (attributedRevenueEffect / totalChange) * 100 : 0,
        signedContributionPct: totalChange !== 0 ? (attributedRevenueEffect / totalChange) * 100 : 0,
        magnitudeContributionPct: totalEffect !== 0 ? (Math.abs(attributedRevenueEffect) / totalEffect) * 100 : 0,
        contributionType: "exact" as const,
        change: currentAttributedRevenue.value - prevAttributedRevenue.value,
        changePct: prevAttributedRevenue.value !== 0 ? ((currentAttributedRevenue.value - prevAttributedRevenue.value) / prevAttributedRevenue.value) * 100 : 0,
        status: "calculated",
        explanation: "Attributed Revenue effect on Marketing ROI via Shapley decomposition: ROI = AttributedRevenue / Spend.",
      },
      {
        driver: "marketingSpend",
        contributionPct: totalEffect !== 0 ? (spendEffect / totalChange) * 100 : 0,
        signedContributionPct: totalChange !== 0 ? (spendEffect / totalChange) * 100 : 0,
        magnitudeContributionPct: totalEffect !== 0 ? (Math.abs(spendEffect) / totalEffect) * 100 : 0,
        contributionType: "exact" as const,
        change: currentSpend.value - prevSpend.value,
        changePct: prevSpend.value !== 0 ? ((currentSpend.value - prevSpend.value) / prevSpend.value) * 100 : 0,
        status: "calculated",
        explanation: "Marketing Spend effect on Marketing ROI via Shapley decomposition: ROI = AttributedRevenue / Spend.",
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