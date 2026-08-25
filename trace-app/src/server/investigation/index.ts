// src/server/investigation/index.ts
// Orchestrator: runs the full Person-1 pipeline once per request (signal ->
// hypotheses -> uncertainty) so /api/investigate returns a single consistent
// payload instead of callers re-deriving pieces independently.
import { getSignal, type KPISignal } from "../signal";
import { scoreHypotheses } from "../hypothesis";
import { deriveUncertainty } from "../uncertainty";
import { computeDataQuality } from "../kpi/quality";
import type { HypothesisResult, UncertaintyReport, RetrievedEvidence } from "../types";

export interface InvestigationResult {
  signal: KPISignal;
  hypotheses: HypothesisResult[];
  uncertainty: UncertaintyReport;
  topEvidence: RetrievedEvidence[];
}

export async function investigate(
  metric: string,
  month: string,
  filters: { region?: string; product?: string } = {}
): Promise<InvestigationResult> {
  const signal = await getSignal(metric, month, filters);
  const hypotheses = signal.is_anomaly ? await scoreHypotheses(metric, month, filters) : [];
  const dataQuality = await computeDataQuality();
  const uncertainty = deriveUncertainty({ signal, hypotheses, dataQuality, filters });

  const topEvidence = hypotheses
    .flatMap((h) => h.supportEvidence)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  return { signal, hypotheses, uncertainty, topEvidence };
}
