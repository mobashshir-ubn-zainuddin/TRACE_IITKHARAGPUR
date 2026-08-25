// src/server/evidence/index.ts
// Evidence Scoring layer: "how strong is the evidence behind this
// explanation?" Takes raw RAG hits + a structured signal and turns them into
// a transparent, weighted contribution to a hypothesis's confidence.
import type { RetrievedDoc } from "../rag/retrieve";
import type { RetrievedEvidence, StructuredSignal } from "../types";

// Direct operational metrics and internal reports are closer to ground truth
// than a single anecdotal review; independent corroboration raises weight.
const RELIABILITY_BY_SOURCE: Record<string, number> = {
  InternalReport: 0.9,
  SupportTicket: 0.75,
  RegionalManagerNote: 0.85,
  CustomerReview: 0.55,
};

function reliabilityFor(source: string): number {
  return RELIABILITY_BY_SOURCE[source] ?? 0.6;
}

/** 1.0 for evidence dated in the target month, decaying the further away it is. */
function recencyFor(date: string, targetMonth: string): number {
  const [ty, tm] = targetMonth.split("-").map(Number);
  const [dy, dm] = date.slice(0, 7).split("-").map(Number);
  const monthsAway = Math.abs((ty - dy) * 12 + (tm - dm));
  return Math.max(0.15, 1 - monthsAway * 0.15);
}

export interface StanceKeywords {
  supportKeywords: string[];
  contradictKeywords: string[];
}

export function classifyStance(text: string, keywords: StanceKeywords): "support" | "contradict" | "neutral" {
  const t = text.toLowerCase();
  if (keywords.contradictKeywords.some((k) => t.includes(k))) return "contradict";
  if (keywords.supportKeywords.some((k) => t.includes(k))) return "support";
  return "neutral";
}

/**
 * Score a batch of RAG hits for one hypothesis: relevance (from retrieval),
 * recency, source reliability, independence (distinct corroborating
 * sources), and stance relative to the hypothesis being tested.
 */
export function scoreEvidence(hits: RetrievedDoc[], targetMonth: string, keywords: StanceKeywords): RetrievedEvidence[] {
  const distinctSources = new Set(hits.map((h) => h.item.source)).size || 1;
  return hits.map(({ item, score }) => {
    const stance = classifyStance(item.text, keywords);
    const reliability = reliabilityFor(item.source);
    const recency = recencyFor(item.date, targetMonth);
    // More distinct source types corroborating the same finding = each item is
    // more independently meaningful, not just one channel repeating itself.
    const independence = Math.min(1, 0.4 + 0.2 * distinctSources);
    const weight = score * reliability * recency * independence;
    return { ...item, relevance: Math.round(score * 1000) / 1000, recency: Math.round(recency * 100) / 100, reliability, independence: Math.round(independence * 100) / 100, stance, weight: Math.round(weight * 1000) / 1000 };
  });
}

export interface HypothesisAggregate {
  rawConfidence: number;
  structuredContribution: number;
  unstructuredContribution: number;
  contradictionPenalty: number;
  supportCount: number;
  contradictCount: number;
}

/**
 * Combine a structured signal (from the KPI/operations data) with scored
 * unstructured evidence into one 0-100 confidence number, with a transparent
 * breakdown so the UI can show *why* the number is what it is.
 */
export function aggregateHypothesisSupport(structuredSignal: StructuredSignal, scoredEvidence: RetrievedEvidence[]): HypothesisAggregate {
  const structuredContribution = structuredSignal.available
    ? Math.max(0, Math.min(1, structuredSignal.supportStrength)) * 55
    : 0;

  const supporting = scoredEvidence.filter((e) => e.stance === "support");
  const contradicting = scoredEvidence.filter((e) => e.stance === "contradict");

  const supportWeightSum = supporting.reduce((s, e) => s + e.weight, 0);
  const contradictWeightSum = contradicting.reduce((s, e) => s + e.weight, 0);

  const unstructuredContribution = Math.min(35, supportWeightSum * 14);
  const contradictionPenalty = Math.min(30, contradictWeightSum * 18);

  // rawConfidence deliberately excludes the contradiction penalty: it represents
  // "how much evidence supports this" before contradictions are weighed in. The
  // caller applies the penalty afterward so the before/after adjustment stays visible.
  const rawConfidence = Math.max(0, Math.min(100, structuredContribution + unstructuredContribution));

  return {
    rawConfidence: Math.round(rawConfidence * 10) / 10,
    structuredContribution: Math.round(structuredContribution * 10) / 10,
    unstructuredContribution: Math.round(unstructuredContribution * 10) / 10,
    contradictionPenalty: Math.round(contradictionPenalty * 10) / 10,
    supportCount: supporting.length,
    contradictCount: contradicting.length,
  };
}
