// src/server/hypothesis/index.ts
// Hypothesis Engine: moves from "here are some correlations" to "here are the
// most plausible explanations." Each hypothesis is checked against a real
// structured operational signal AND retrieved unstructured evidence, then
// scored for/against by the Evidence Scoring layer.
import { getDB, getRegions } from "../db";
import { normalizeMetric } from "../kpi/definitions";
import { computeCurrentValue, shiftMonth } from "../kpi";
import { retrieveEvidence } from "../rag";
import { scoreEvidence, aggregateHypothesisSupport, type StanceKeywords } from "../evidence";
import type { HypothesisResult, StructuredSignal, RetrievedEvidence } from "../types";

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function stdDev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}
function zOf(current: number, series: number[]): { mean: number; std: number; z: number } {
  const m = mean(series);
  const s = stdDev(series, m);
  return { mean: m, std: s, z: s > 0 ? (current - m) / s : 0 };
}

type Filters = { region?: string; product?: string };

async function avgOpsMetric(column: "stockout_rate" | "delivery_delay_rate", month: string, region?: string): Promise<number> {
  const db = await getDB();
  const params: (string | number)[] = [month + "%"];
  let where = "WHERE date LIKE ?";
  if (region) {
    const r = await db.get("SELECT id FROM regions WHERE name = ?", region);
    if (r) { where += " AND region_id = ?"; params.push(r.id); }
  }
  const row = await db.get(`SELECT AVG(${column}) as v FROM operations_daily ${where}`, ...params);
  return row?.v || 0;
}

async function conversionRate(month: string, region?: string): Promise<number> {
  const db = await getDB();
  const params: (string | number)[] = [month + "%"];
  let where = "WHERE date LIKE ?";
  if (region) {
    const r = await db.get("SELECT id FROM regions WHERE name = ?", region);
    if (r) { where += " AND region_id = ?"; params.push(r.id); }
  }
  const row = await db.get(`SELECT SUM(conversions) as conv, SUM(sessions) as sess FROM marketing_daily ${where}`, ...params);
  return row?.sess ? row.conv / row.sess : 0;
}

async function trailingMonths(month: string, windowSize = 6): Promise<string[]> {
  const months: string[] = [];
  for (let i = windowSize; i >= 1; i--) months.push(shiftMonth(month, -i));
  return months;
}

async function opsStructuredSignal(
  metricLabel: string,
  column: "stockout_rate" | "delivery_delay_rate",
  month: string,
  region: string | undefined,
  direction: "higher_supports" | "lower_supports"
): Promise<StructuredSignal> {
  const months = await trailingMonths(month);
  const series = await Promise.all(months.map((m) => avgOpsMetric(column, m, region)));
  const current = await avgOpsMetric(column, month, region);
  const { mean: m, std: s, z } = zOf(current, series);
  const supportStrength = direction === "higher_supports"
    ? Math.max(0, Math.min(1, z / 4))
    : Math.max(0, Math.min(1, -z / 4));
  return {
    metric: metricLabel,
    currentValue: Math.round(current * 10000) / 100, // as %
    baselineMean: Math.round(m * 10000) / 100,
    baselineStd: Math.round(s * 10000) / 100,
    zScore: Math.round(z * 100) / 100,
    deltaPct: m !== 0 ? Math.round(((current - m) / m) * 10000) / 100 : null,
    available: true,
    supportStrength,
  };
}

async function conversionStructuredSignal(month: string, region?: string): Promise<StructuredSignal> {
  const months = await trailingMonths(month);
  const series = await Promise.all(months.map((m) => conversionRate(m, region)));
  const current = await conversionRate(month, region);
  const { mean: m, std: s, z } = zOf(current, series);
  return {
    metric: "conversion_rate",
    currentValue: Math.round(current * 10000) / 100,
    baselineMean: Math.round(m * 10000) / 100,
    baselineStd: Math.round(s * 10000) / 100,
    zScore: Math.round(z * 100) / 100,
    deltaPct: m !== 0 ? Math.round(((current - m) / m) * 10000) / 100 : null,
    available: true,
    supportStrength: Math.max(0, Math.min(1, -z / 4)), // a *drop* in conversion supports this hypothesis
  };
}

/**
 * Cross-sectional seasonality control: if the target region's month-over-month
 * change closely matches what other regions experienced (a shared seasonal
 * factor should hit everyone similarly), seasonality is plausible. If the
 * target region moved far more than its peers, something region-specific is
 * the more likely explanation.
 */
async function seasonalityStructuredSignal(metric: string, month: string, region?: string): Promise<StructuredSignal> {
  if (!region) {
    return {
      metric: "peer_region_change_pct",
      currentValue: 0, baselineMean: 0, baselineStd: 0, zScore: null, deltaPct: null,
      available: false, supportStrength: 0,
      note: "No region specified — cannot compare against peer regions to isolate a seasonal effect.",
    };
  }
  const prev = shiftMonth(month, -1);
  const allRegions = await getRegions();
  const changePcts: Record<string, number> = {};
  for (const r of allRegions) {
    const cur = await computeCurrentValue(metric, { month, region: r.name });
    const prv = await computeCurrentValue(metric, { month: prev, region: r.name });
    changePcts[r.name] = prv !== 0 ? ((cur - prv) / prv) * 100 : 0;
  }
  const targetChange = changePcts[region] ?? 0;
  const peerChanges = Object.entries(changePcts).filter(([name]) => name !== region).map(([, v]) => v);
  const peerMean = mean(peerChanges);
  const peerStd = stdDev(peerChanges, peerMean);
  const excess = targetChange - peerMean;
  const deviationRatio = peerStd > 0 ? Math.abs(excess) / peerStd : Math.abs(excess) / 10;
  const supportStrength = Math.max(0, Math.min(1, 1 - deviationRatio / 3));
  return {
    metric: "peer_region_change_pct",
    currentValue: Math.round(targetChange * 100) / 100,
    baselineMean: Math.round(peerMean * 100) / 100,
    baselineStd: Math.round(peerStd * 100) / 100,
    zScore: Math.round((peerStd > 0 ? excess / peerStd : 0) * 100) / 100,
    deltaPct: Math.round(excess * 100) / 100,
    available: true,
    supportStrength,
    note: `${region} moved ${targetChange.toFixed(1)}% vs. a ${peerMean.toFixed(1)}% average across other regions in the same month.`,
  };
}

interface HypothesisDef {
  id: number;
  key: string;
  description: string;
  ragQuery: string;
  keywords: StanceKeywords;
  dataAvailable: boolean;
  computeStructuredSignal: (metric: string, month: string, filters: Filters) => Promise<StructuredSignal>;
}

const HYPOTHESES: HypothesisDef[] = [
  {
    id: 1,
    key: "delivery_reliability",
    description: "Delivery reliability issues (SLA delay)",
    ragQuery: "delivery delay shipping late SLA logistics",
    keywords: {
      supportKeywords: ["delay", "late", "took longer", "sla"],
      contradictKeywords: ["remained within target", "no material change", "stable", "on time", "arrived quickly"],
    },
    dataAvailable: true,
    computeStructuredSignal: (_metric, month, filters) => opsStructuredSignal("delivery_delay_rate", "delivery_delay_rate", month, filters.region, "higher_supports"),
  },
  {
    id: 2,
    key: "competitor_pricing",
    description: "Competitor pricing pressure",
    ragQuery: "competitor pricing lower price rival discount comparison market",
    keywords: {
      supportKeywords: ["competitor", "rival", "cheaper elsewhere", "price war"],
      contradictKeywords: [],
    },
    dataAvailable: false,
    computeStructuredSignal: async () => ({
      metric: "competitor_price_index",
      currentValue: 0, baselineMean: 0, baselineStd: 0, zScore: null, deltaPct: null,
      available: false, supportStrength: 0,
      note: "No competitor pricing data source is connected. This hypothesis cannot be structurally verified.",
    }),
  },
  {
    id: 3,
    key: "conversion_decline",
    description: "Conversion rate decline",
    ragQuery: "checkout conversion cart abandonment unable to purchase failed",
    keywords: {
      supportKeywords: ["checkout", "cart", "unavailable at checkout", "removed from cart", "couldn't complete", "conversion"],
      contradictKeywords: ["no significant change", "remained flat"],
    },
    dataAvailable: true,
    computeStructuredSignal: (_metric, month, filters) => conversionStructuredSignal(month, filters.region),
  },
  {
    id: 4,
    key: "inventory_shortage",
    description: "Inventory / stockout shortage",
    ragQuery: "product stockout out of stock inventory unavailable backorder cancelled",
    keywords: {
      supportKeywords: ["out of stock", "stockout", "backorder", "unavailable", "waitlist", "cancelled"],
      contradictKeywords: ["in stock", "fully stocked"],
    },
    dataAvailable: true,
    computeStructuredSignal: (_metric, month, filters) => opsStructuredSignal("stockout_rate", "stockout_rate", month, filters.region, "higher_supports"),
  },
  {
    id: 5,
    key: "seasonality",
    description: "Seasonality effects",
    ragQuery: "seasonal holiday demand pattern typical for this time of year",
    keywords: {
      supportKeywords: ["seasonal", "typical for this time of year", "holiday slowdown"],
      contradictKeywords: ["unprecedented", "unusual for this time of year"],
    },
    dataAvailable: true,
    computeStructuredSignal: (metric, month, filters) => seasonalityStructuredSignal(metric, month, filters.region),
  },
];

function buildRationale(h: HypothesisDef, signal: StructuredSignal, confidence: number, supportCount: number, contradictCount: number): string {
  if (!signal.available) {
    const note = (signal.note ?? "required data is not available").replace(/\.$/, "");
    return `${h.description}: ${note}. This hypothesis cannot be evaluated with confidence and should not be ruled out or in.`;
  }
  if (confidence >= 60) {
    return `${h.description} is the most strongly supported explanation among the available evidence (${supportCount} corroborating item(s), ${signal.metric} deviates ${signal.zScore ?? 0}σ from its recent baseline). This reflects the strength of correlation, not proven causation.`;
  }
  if (contradictCount > 0 && confidence < 40) {
    return `${h.description} has limited support — structured data and/or reports contain evidence that contradicts this explanation (${contradictCount} contradicting item(s)).`;
  }
  if (confidence < 25) {
    return `${h.description} has weak or inconclusive support from the available evidence.`;
  }
  return `${h.description} has some supporting evidence but is not strongly confirmed (${supportCount} corroborating item(s)).`;
}

export async function scoreHypotheses(metric: string, month: string, filters: Filters = {}): Promise<HypothesisResult[]> {
  const normalizedMetric = normalizeMetric(metric);
  const windowStart = shiftMonth(month, -1);

  const results: HypothesisResult[] = [];
  for (const h of HYPOTHESES) {
    const structuredSignal = await h.computeStructuredSignal(normalizedMetric, month, filters);
    const hits = await retrieveEvidence(h.ragQuery, {
      region: filters.region,
      dateFrom: windowStart,
      dateTo: month,
      topK: 20,
      minScore: 0.05,
    });
    const scored: RetrievedEvidence[] = scoreEvidence(hits, month, h.keywords);
    const aggregate = aggregateHypothesisSupport(structuredSignal, scored);
    const confidence = Math.max(0, Math.round((aggregate.rawConfidence - aggregate.contradictionPenalty) * 10) / 10);

    const supportEvidence = scored.filter((e) => e.stance === "support").sort((a, b) => b.weight - a.weight).slice(0, 6);
    const contradictingEvidence = scored.filter((e) => e.stance === "contradict").sort((a, b) => b.weight - a.weight).slice(0, 6);

    results.push({
      id: h.id,
      key: h.key,
      description: h.description,
      dataAvailable: h.dataAvailable,
      rawConfidence: aggregate.rawConfidence,
      confidence, // pre-uncertainty-layer: already reflects this hypothesis's own contradicting evidence
      structuredSignal,
      supportEvidence,
      contradictingEvidence,
      breakdown: {
        structuredContribution: aggregate.structuredContribution,
        unstructuredContribution: aggregate.unstructuredContribution,
        contradictionPenalty: aggregate.contradictionPenalty,
      },
      rationale: buildRationale(h, structuredSignal, confidence, aggregate.supportCount, aggregate.contradictCount),
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}
