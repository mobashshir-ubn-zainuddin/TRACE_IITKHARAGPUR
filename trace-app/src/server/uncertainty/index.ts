// src/server/uncertainty/index.ts
// "Your system must know when it doesn't know." Takes the KPI signal plus
// the hypothesis engine's output and decides: is there enough, consistent
// evidence to name a root cause, or should TRACE abstain and say so?
import { getSignal, type KPISignal } from "../signal";
import { scoreHypotheses } from "../hypothesis";
import { computeDataQuality } from "../kpi/quality";
import type { UncertaintyReport, HypothesisResult } from "../types";

// If the top two hypotheses are within this many confidence points of each
// other, treat the result as ambiguous rather than picking a "winner" by a
// margin that's really just noise in the scoring.
const AMBIGUITY_MARGIN = 12;
const MIN_CONFIDENT_THRESHOLD = 25;

export interface UncertaintyInput {
  signal: KPISignal;
  hypotheses: HypothesisResult[];
  dataQuality: { completenessPct: number };
  filters: { region?: string; product?: string };
}

/** Pure decision logic — no I/O — so it can be reused across API routes without recomputing the pipeline. */
export function deriveUncertainty({ signal, hypotheses, dataQuality, filters }: UncertaintyInput): UncertaintyReport {
  const missingDataSources = new Set<string>();
  for (const h of hypotheses) {
    if (!h.dataAvailable) missingDataSources.add(h.structuredSignal.note ?? `${h.description}: required data unavailable`);
  }

  const contradictions = hypotheses
    .filter((h) => h.contradictingEvidence.length > 0)
    .map((h) => ({
      hypothesis: h.description,
      supportingSignal: `${h.structuredSignal.metric} = ${h.structuredSignal.currentValue} (recent baseline ${h.structuredSignal.baselineMean})`,
      contradictingSignal: h.contradictingEvidence[0]?.text ?? "available evidence does not confirm the hypothesized direction",
      note: `Confidence reduced from ${h.rawConfidence}% to ${h.confidence}% after weighing contradicting evidence.`,
    }));

  const confidenceAdjustments = hypotheses
    .filter((h) => h.rawConfidence !== h.confidence)
    .map((h) => ({
      hypothesis: h.description,
      before: h.rawConfidence,
      after: h.confidence,
      reason: `${h.contradictingEvidence.length} contradicting evidence item(s) found`,
    }));

  const evaluable = hypotheses.filter((h) => h.dataAvailable);
  const evidenceCoveragePct = hypotheses.length ? (evaluable.length / hypotheses.length) * 100 : 100;
  const dataCompletenessPct = Math.round(((dataQuality.completenessPct + evidenceCoveragePct) / 2) * 10) / 10;

  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const second = sorted[1];

  let ambiguous = false;
  let topHypothesis: string | null = null;
  let abstentionMessage: string | undefined;
  const recommendedDataCollection = new Set<string>(missingDataSources);

  if (!signal.is_anomaly) {
    abstentionMessage = `No statistically significant movement was detected in ${signal.label}${filters.region ? ` for ${filters.region}` : ""} in ${signal.period} (z-score ${signal.zScore}). This falls within normal business variation, so a root-cause investigation is not warranted.`;
  } else if (!top || top.confidence < MIN_CONFIDENT_THRESHOLD) {
    ambiguous = true;
    abstentionMessage = "No single root cause can be established from the available evidence — confidence across all hypotheses is too low to act on.";
    recommendedDataCollection.add("Broaden evidence collection (more support tickets, reviews, or operational reports) before drawing a conclusion.");
  } else if (second && top.confidence - second.confidence < AMBIGUITY_MARGIN) {
    ambiguous = true;
    abstentionMessage = `No single root cause can be established with confidence: "${top.description}" (${top.confidence}%) and "${second.description}" (${second.confidence}%) are too close to separate given current evidence. They may also be related, e.g. one could be a downstream effect of the other rather than an independent cause.`;
    recommendedDataCollection.add(`Investigate whether "${second.description}" is a downstream effect of "${top.description}" rather than a competing explanation.`);
  } else {
    topHypothesis = top.description;
  }

  return {
    metric: signal.kpi,
    month: signal.period,
    region: filters.region,
    dataCompletenessPct,
    missingDataSources: [...missingDataSources],
    contradictions,
    confidenceAdjustments,
    ambiguous,
    topHypothesis,
    abstentionMessage,
    recommendedDataCollection: [...recommendedDataCollection],
    uncertainty_pct: Math.round((100 - dataCompletenessPct) * 10) / 10,
  };
}

export async function computeUncertainty(
  metric: string,
  month: string,
  filters: { region?: string; product?: string } = {}
): Promise<UncertaintyReport> {
  const signal = await getSignal(metric, month, filters);
  const hypotheses = signal.is_anomaly ? await scoreHypotheses(metric, month, filters) : [];
  const dataQuality = await computeDataQuality();
  return deriveUncertainty({ signal, hypotheses, dataQuality, filters });
}
