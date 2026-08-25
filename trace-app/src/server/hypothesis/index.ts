// src/server/hypothesis/index.ts
import { searchEvidence } from "../evidence";

export interface Hypothesis {
  id: number;
  description: string;
  confidence: number; // 0-100
}

// Fixed hypothesis list (could be stored elsewhere)
const hypotheses = [
  { id: 1, description: "Delivery reliability issues" },
  { id: 2, description: "Competitor pricing pressure" },
  { id: 3, description: "Conversion rate decline" },
  { id: 4, description: "Inventory shortage" },
  { id: 5, description: "Seasonality effects" },
];

/**
 * Score a hypothesis based on relevance of evidence items.
 * For the prototype we simply count matching topic keywords.
 */
export async function scoreHypotheses(metric: string, month: string): Promise<Hypothesis[]> {
  // Get KPI value to use as a signal for evidence relevance
  // We'll just reuse the KPI module to fetch the value
  const { computeKPI } = await import("../kpi");
  const kpiRes = await computeKPI(metric, month);
  const signal = kpiRes.value;

  // Pull top evidence items
  const topEvidence = await searchEvidence(signal, 50);

  // Simple scoring: count evidence where topic appears in description
  const results = hypotheses.map((h) => {
    const keyword = h.description.split(' ')[0].toLowerCase(); // crude keyword
    const support = topEvidence.filter((e) =>
      e.topic.toLowerCase().includes(keyword)
    ).length;
    const confidence = Math.min(100, Math.round((support / topEvidence.length) * 100));
    return { ...h, confidence };
  });
  return results;
}