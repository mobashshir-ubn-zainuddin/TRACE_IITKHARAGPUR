/**
 * Hypothesis generation, scoring and ranking (Module 3, Tasks 12-14).
 *
 * Three defects corrected here:
 *
 * Task 12 -- CAUSAL PLAUSIBILITY was inflated arbitrarily. The old rule added
 *   +0.1 simply because `expectedDirection === "negative"`, so every negative
 *   driver scored higher than every positive one for no defensible reason.
 *   Plausibility is now a deterministic mechanism-compatibility score built from
 *   the driver definition, observed direction consistency, controllability,
 *   lever availability and temporal precedence. It is kept strictly SEPARATE
 *   from statistical association -- the two are different kinds of evidence.
 *
 * Task 13 -- EVIDENCE AVAILABILITY used `evidenceRequests.length / 5`. Evidence
 *   *requests* are generated from `candidateLevers`, so a driver with more
 *   levers scored as having more evidence available. That is backwards: asking
 *   five questions is not the same as having five answers. Availability is now
 *   the fraction of required quantitative observations that ACTUALLY EXIST in
 *   the warehouse. Unstructured evidence stays at 0 until Module 4 supplies
 *   real retrieval.
 *
 * Task 14 -- SCORE inputs are now semantically valid: a driver with no resolver
 *   yields `insufficient_data`, not a fabricated r = 0 that scores like a
 *   measured null result.
 *
 * LANGUAGE. Nothing here asserts causation. Correlation is described as
 * "associated with"; hypotheses are "supported", "plausible contributors", or
 * "require additional evidence".
 */

import type {
  Contradiction,
  DriverHypothesis,
  EvidenceRequest,
  EvidenceAvailability,
  AssociationResult,
  TemporalAlignment,
  SegmentConsistency,
  DriverContribution,
  DriverDefinition,
} from "./types";
import { DRIVER_DEFINITIONS } from "./definitions";
import { DEFAULT_DRIVER_CONFIG, type DriverConfig } from "./config";
import { normalizeMetric } from "../kpi/definitions";
import { monthToDateRange } from "../utils/dateUtils";
import { isDriverHistorySupported, type DriverFilters } from "./history";
import { getDriverAnalysisContext, type DriverAnalysisContext } from "./context";

// ---------------------------------------------------------------------------
// Component normalisers
// ---------------------------------------------------------------------------

/** Map a magnitude contribution share (0-100%) onto [0,1]. */
function normalizeContribution(magnitudeContributionPct: number): number {
  const pct = Math.abs(magnitudeContributionPct);
  if (pct >= 50) return 0.9;
  if (pct >= 30) return 0.7;
  if (pct >= 15) return 0.5;
  if (pct >= 5) return 0.3;
  return 0.1;
}

/**
 * For drivers that are not algebraic factors of the KPI there is no exact
 * contribution share, so the driver's own relative movement is used instead.
 * Saturating at 50% movement keeps a single volatile driver from dominating.
 */
function normalizeMovement(changePct: number | null): number {
  if (changePct === null || !Number.isFinite(changePct)) return 0;
  return Math.min(1, Math.abs(changePct) / 50);
}

/** Association strength on [0,1], discounted when not statistically significant. */
function normalizeAssociation(association: AssociationResult | undefined): number {
  if (!association) return 0;
  if (association.insufficientData || association.pearsonR === null) return 0;

  const absR = Math.abs(association.pearsonR);
  let base: number;
  if (absR >= 0.85) base = 1.0;
  else if (absR >= 0.7) base = 0.8;
  else if (absR >= 0.5) base = 0.6;
  else if (absR >= 0.3) base = 0.4;
  else base = 0.1;

  // An association that could plausibly be noise should not score as evidence.
  return association.isStatisticallySignificant ? base : base * 0.5;
}

/**
 * Task 12 -- deterministic mechanism compatibility.
 *
 * Five observable sub-scores, each in [0,1], combined with fixed weights. None
 * of them reward a driver merely for having a negative expected direction.
 *
 *   mechanismDefined     is the driver backed by real tables/columns and a
 *                        resolvable series?
 *   controllability      is there an operational lever at all?
 *   leverAvailability    are concrete candidate levers enumerated? (presence,
 *                        deliberately NOT scaled by count, so listing more
 *                        levers cannot inflate the score)
 *   directionConsistency did the driver actually move in the direction its
 *                        mechanism predicts, given how the KPI moved?
 *   temporalPrecedence   did the driver move BEFORE the KPI?
 */
export function calculateCausalPlausibility(
  def: DriverDefinition,
  observedDriverChangePct: number | null,
  kpiChangePct: number,
  temporal: TemporalAlignment | undefined,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): { score: number; components: Record<string, number> } {
  const mechanismDefined =
    isDriverHistorySupported(def.id) && def.sourceTables.length > 0 && def.sourceColumns.length > 0
      ? 1
      : 0;

  const controllability = def.controllable ? 1 : 0;
  const leverAvailability = def.candidateLevers.length > 0 ? 1 : 0;

  // Direction consistency: for a positive driver, driver and KPI should move the
  // same way; for a negative driver, opposite ways.
  let directionConsistency = 0.5; // neutral when nothing moved materially
  const material = config.segmentConsistency.materialChangePct;
  if (
    observedDriverChangePct !== null &&
    Number.isFinite(observedDriverChangePct) &&
    Math.abs(observedDriverChangePct) >= material &&
    Math.abs(kpiChangePct) >= material
  ) {
    const sameDirection = Math.sign(observedDriverChangePct) === Math.sign(kpiChangePct);
    const consistent = def.expectedDirection === "positive" ? sameDirection : !sameDirection;
    directionConsistency = consistent ? 1 : 0;
  }

  // Temporal precedence: only a lead establishes that the driver moved first.
  let temporalPrecedence = 0.5;
  if (temporal && !temporal.insufficientData) {
    if (temporal.lagDirection === "leads") temporalPrecedence = 1;
    else if (temporal.lagDirection === "contemporaneous") temporalPrecedence = 0.5;
    else temporalPrecedence = 0;
  }

  const components = {
    mechanismDefined,
    controllability,
    leverAvailability,
    directionConsistency,
    temporalPrecedence,
  };

  const score =
    0.30 * mechanismDefined +
    0.20 * controllability +
    0.15 * leverAvailability +
    0.20 * directionConsistency +
    0.15 * temporalPrecedence;

  return { score: Math.min(1, Math.max(0, score)), components };
}

/**
 * Task 13 -- structured evidence availability.
 *
 * Counts how many of the required quantitative observations for this driver
 * genuinely exist. Deliberately independent of how many evidence REQUESTS were
 * generated.
 */
export function calculateEvidenceAvailability(
  driverId: string,
  contribution: DriverContribution | undefined,
  association: AssociationResult | undefined,
  temporal: TemporalAlignment | undefined,
  segment: SegmentConsistency | undefined,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): EvidenceAvailability {
  const checks: Array<{ name: string; present: boolean }> = [
    {
      name: "driver_history_series",
      present: isDriverHistorySupported(driverId),
    },
    {
      name: "period_over_period_value",
      present: contribution !== undefined && Number.isFinite(contribution.change),
    },
    {
      name: "quantified_contribution",
      present: contribution?.contributionType === "exact" &&
        contribution.magnitudeContributionPct !== null &&
        contribution.magnitudeContributionPct !== undefined,
    },
    {
      name: "statistical_association",
      present: association !== undefined && !association.insufficientData && association.pearsonR !== null,
    },
    {
      name: "temporal_alignment",
      present: temporal !== undefined && !temporal.insufficientData,
    },
    {
      name: "segment_breakdown",
      present: segment !== undefined && !segment.insufficientData && (segment.evaluatedSegments ?? 0) > 0,
    },
  ];

  const observedChecks = checks.filter((c) => c.present).length;
  const requiredChecks = checks.length;
  const structured = requiredChecks > 0 ? observedChecks / requiredChecks : 0;

  // Module 4 (RAG over unstructured sources) is not built yet. Reporting a
  // non-zero value here would claim evidence that has not been retrieved.
  const unstructured = 0;

  const w = config.evidenceAvailabilityWeights;
  const score = Math.min(1, Math.max(0, structured * w.structured + unstructured * w.unstructured));

  return {
    structuredEvidenceAvailability: structured,
    unstructuredEvidenceAvailability: unstructured,
    score,
    observedChecks,
    requiredChecks,
    missing: checks.filter((c) => !c.present).map((c) => c.name),
    note: "Unstructured evidence has not been evaluated; Module 4 retrieval is not yet available.",
  };
}

// ---------------------------------------------------------------------------
// Claim wording (no causal language)
// ---------------------------------------------------------------------------

function describeAssociation(association: AssociationResult | undefined): string {
  if (!association || association.insufficientData || association.pearsonR === null) {
    return "association could not be tested on the available history";
  }
  const direction = association.pearsonR > 0 ? "positively" : "negatively";
  const sig = association.isStatisticallySignificant
    ? `p=${association.pValue!.toFixed(3)}`
    : `p=${association.pValue!.toFixed(3)}, not significant at alpha=${association.alpha}`;
  return `${direction} associated (r=${association.pearsonR.toFixed(2)}, ${sig}, n=${association.sampleSize})`;
}

function describeTemporal(temporal: TemporalAlignment | undefined): string {
  if (!temporal || temporal.insufficientData) return "temporal precedence untested";
  const lag = Math.abs(temporal.bestLag);
  if (temporal.lagDirection === "leads") {
    return `movement leads the metric by ${lag} month${lag === 1 ? "" : "s"}`;
  }
  if (temporal.lagDirection === "lags") {
    return `movement follows the metric by ${lag} month${lag === 1 ? "" : "s"}, so it cannot account for the metric movement`;
  }
  return "movement is contemporaneous with the metric";
}

function buildClaim(
  def: DriverDefinition,
  contribution: DriverContribution | undefined,
  association: AssociationResult | undefined,
  temporal: TemporalAlignment | undefined,
  kpiLabel: string
): string {
  const changePct = contribution?.changePct;
  const movement =
    changePct !== null && changePct !== undefined && Number.isFinite(changePct)
      ? `${def.name} ${changePct > 0 ? "increased" : "decreased"} by ${Math.abs(changePct).toFixed(1)}%`
      : `${def.name} movement could not be quantified`;

  if (contribution?.contributionType === "exact") {
    const mag = contribution.magnitudeContributionPct;
    const signed = contribution.signedContributionPct;
    return (
      `${movement}, accounting for ${mag !== null && mag !== undefined ? mag.toFixed(1) : "n/a"}% ` +
      `of the absolute movement in ${kpiLabel} ` +
      `(net contribution ${signed !== null && signed !== undefined ? signed.toFixed(1) : "n/a"}%), ` +
      `by exact Shapley decomposition. It is ${describeAssociation(association)}; ${describeTemporal(temporal)}.`
    );
  }

  if (contribution?.contributionType === "statistical" || contribution?.status === "not_exactly_decomposable") {
    return (
      `${movement}. It is not an exact algebraic component of ${kpiLabel}, so no exact contribution share ` +
      `is available. It is ${describeAssociation(association)}; ${describeTemporal(temporal)}. ` +
      `Consistent with a contributing mechanism, but requires additional evidence.`
    );
  }

  return `Insufficient data to quantify the relationship between ${def.name} and ${kpiLabel}.`;
}

// ---------------------------------------------------------------------------
// Hypothesis assembly
// ---------------------------------------------------------------------------

/** Build hypotheses from an already-computed context. Performs no queries. */
export function buildHypothesesFromContext(ctx: DriverAnalysisContext): DriverHypothesis[] {
  const config = ctx.config;
  const weights = config.hypothesisWeights;
  const hypotheses: DriverHypothesis[] = [];

  for (const def of ctx.drivers) {
    const contribution = ctx.contributions.find((c) => c.driver === def.id);
    const association = ctx.associations.find((a) => a.driver === def.id);
    const temporal = ctx.temporalAlignments.find((t) => t.driver === def.id);
    const segment = ctx.segmentConsistency.find((s) => s.driver === def.id);
    const driverContradictions = ctx.contradictions.filter((c) => c.driver === def.id);

    const supported = isDriverHistorySupported(def.id);

    // --- component scores ------------------------------------------------
    let contributionScore: number;
    if (contribution?.contributionType === "exact" && contribution.magnitudeContributionPct != null) {
      contributionScore = normalizeContribution(contribution.magnitudeContributionPct);
    } else if (contribution && contribution.contributionType !== "insufficient_data") {
      contributionScore = normalizeMovement(contribution.changePct);
    } else {
      contributionScore = 0;
    }

    const associationScore = normalizeAssociation(association);
    const temporalScore = temporal && !temporal.insufficientData ? temporal.temporalScore : 0;
    const segmentScore = segment && !segment.insufficientData ? segment.consistencyScore : 0;

    const causal = calculateCausalPlausibility(
      def,
      contribution?.changePct ?? null,
      ctx.totalChangePct,
      temporal,
      config
    );

    const evidence = calculateEvidenceAvailability(
      def.id,
      contribution,
      association,
      temporal,
      segment,
      config
    );

    // --- Task 14: weighted score ----------------------------------------
    const score =
      weights.contribution * contributionScore +
      weights.association * associationScore +
      weights.temporal * temporalScore +
      weights.segmentConsistency * segmentScore +
      weights.causalPlausibility * causal.score +
      weights.evidenceAvailability * evidence.score;

    // --- contradiction penalty (Task 11) --------------------------------
    // A contradiction never removes the hypothesis; it reduces confidence and
    // is surfaced as a caveat so the conflicting evidence stays visible.
    let contradictionPenalty = 0;
    for (const c of driverContradictions) {
      contradictionPenalty +=
        c.effect === "invalidates"
          ? config.contradictionPenalties.invalidates
          : config.contradictionPenalties.weakens;
    }

    const confidence = Math.max(0, Math.min(1, score - contradictionPenalty));

    // --- status ----------------------------------------------------------
    let status: DriverHypothesis["status"];
    if (!supported || contribution?.contributionType === "insufficient_data") {
      status = "insufficient_data";
    } else if (confidence >= config.hypothesisThresholds.strongCandidate) {
      status = "strong_candidate";
    } else if (confidence >= config.hypothesisThresholds.candidate) {
      status = "candidate";
    } else if (confidence >= config.hypothesisThresholds.weakCandidate) {
      status = "weak_candidate";
    } else {
      status = "insufficient_data";
    }

    // --- caveats ---------------------------------------------------------
    const caveats: string[] = [];
    if (!supported) {
      caveats.push(
        `No SQL-backed history resolver exists for this driver, so association, temporal and segment evidence could not be evaluated.`
      );
    }
    if (association?.insufficientData && supported) {
      caveats.push(`Association not tested: ${association.reason ?? "insufficient paired observations"}.`);
    } else if (association && association.pearsonR !== null && !association.isStatisticallySignificant) {
      caveats.push(
        `Association is not statistically significant (p=${association.pValue?.toFixed(3)} > alpha=${association.alpha}); consistent with no linear association.`
      );
    }
    if (temporal?.lagDirection === "lags" && !temporal.insufficientData) {
      caveats.push(
        `Driver movement follows the metric by ${Math.abs(temporal.bestLag)} month(s), which does not support it as an explanation for the metric movement.`
      );
    }
    if (temporal?.insufficientData && supported) {
      caveats.push(`Temporal precedence not established: ${temporal.reason ?? "insufficient observations"}.`);
    }
    if (segment?.insufficientData && supported) {
      caveats.push(`Segment consistency not evaluated: ${segment.reason ?? "insufficient comparable segments"}.`);
    } else if (segment && segment.consistencyScore < config.segmentConsistency.consistencyThreshold) {
      caveats.push(
        `Direction holds in only ${segment.consistentSegments.length} of ${segment.evaluatedSegments} evaluated segments.`
      );
    }
    if (contribution?.status === "not_exactly_decomposable") {
      caveats.push(contribution.explanation ?? "Not an exact algebraic component of the metric.");
    }
    if (evidence.structuredEvidenceAvailability < 1) {
      caveats.push(`Structured evidence incomplete: missing ${evidence.missing.join(", ")}.`);
    }
    caveats.push(evidence.note);
    for (const c of driverContradictions) {
      caveats.push(`Contradictory evidence: ${c.explanation ?? c.metric}`);
    }

    hypotheses.push({
      id: "",
      name: def.name,
      description: def.description,
      driver: def.id,
      claim: buildClaim(def, contribution, association, temporal, ctx.kpiDef.label),
      expectedDirection: def.expectedDirection,
      scope: {
        metric: ctx.kpiDef.name,
        period: ctx.period,
        region: ctx.filters.region,
        product: ctx.filters.product,
        channel: ctx.filters.channel,
      },
      contributionPct: contribution?.magnitudeContributionPct ?? null,
      signedContributionPct: contribution?.signedContributionPct ?? null,
      magnitudeContributionPct: contribution?.magnitudeContributionPct ?? null,
      associationScore: association?.pearsonR ?? null,
      pValue: association?.pValue ?? null,
      isStatisticallySignificant: association?.isStatisticallySignificant ?? false,
      sampleSize: association?.sampleSize ?? 0,
      temporalAlignment: temporal?.temporalScore ?? null,
      bestLag: temporal?.bestLag,
      lagDirection: temporal?.lagDirection,
      segmentConsistency: segment?.consistencyScore ?? null,
      causalPlausibility: causal.score,
      evidenceAvailability: evidence.score,
      evidenceDetail: evidence,
      score,
      confidence,
      status,
      caveats,
      contradictions: driverContradictions,
      scoreBreakdown: {
        contribution: contributionScore,
        association: associationScore,
        temporal: temporalScore,
        segmentConsistency: segmentScore,
        causalPlausibility: causal.score,
        evidenceAvailability: evidence.score,
        contradictionPenalty,
      },
    });
  }

  // Rank by confidence (post-penalty), falling back to raw score.
  hypotheses.sort((a, b) => (b.confidence - a.confidence) || (b.score - a.score));
  hypotheses.forEach((h, i) => { h.id = `H${i + 1}`; });

  return hypotheses;
}

/**
 * Public entry point. Uses the shared analysis context, so calling this
 * alongside `analyzeDrivers()` for the same scope costs one computation, not two.
 */
export async function generateHypotheses(
  metric: string,
  period: string,
  filters?: DriverFilters,
  config: DriverConfig = DEFAULT_DRIVER_CONFIG
): Promise<DriverHypothesis[]> {
  const ctx = await getDriverAnalysisContext(normalizeMetric(metric), period, filters ?? {}, config);
  return buildHypothesesFromContext(ctx);
}

/**
 * Evidence REQUESTS -- questions worth asking about a driver.
 *
 * Deliberately kept separate from evidence AVAILABILITY (see Task 13): the
 * number of requests generated here must never feed the availability score.
 */
export function generateEvidenceRequests(
  driverId: string,
  metric: string,
  period: string,
  filters?: DriverFilters
): EvidenceRequest[] {
  const def = DRIVER_DEFINITIONS[driverId];
  if (!def) return [];

  const { start, end } = monthToDateRange(period);

  return def.candidateLevers.map((lever) => ({
    hypothesisId: `H${driverId}`,
    metric,
    period,
    driver: def.name,
    query: `${def.name} ${metric} ${period} ${filters?.region ?? ""}`.trim(),
    filters: {
      region: filters?.region,
      product: filters?.product,
      dateStart: start,
      dateEnd: end,
    },
    requiredEvidence: [lever],
  }));
}

export type { Contradiction };
