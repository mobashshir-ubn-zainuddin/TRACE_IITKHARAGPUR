/**
 * Module 3 analytical contracts.
 *
 * Two distinct notions of "contribution" appear throughout and must never be
 * conflated in maths or UI:
 *
 *   signedContributionPct    = change_i / totalChange * 100
 *       Share of the NET change. Legitimately exceeds 100% or goes negative
 *       when segments move in opposite directions and offset each other.
 *       Never clamp this to [0, 100].
 *
 *   magnitudeContributionPct = |change_i| / SUM_j|change_j| * 100
 *       Share of total absolute movement. Always in [0, 100] and sums to ~100%
 *       across the set. This is the only one that is a "share of impact".
 */

export interface DimensionContribution {
  dimension: string;
  dimensionValue: string;
  change: number;
  changePct: number | null;
  /** @deprecated Ambiguous. Retained for callers not yet migrated; equals signedContributionPct. */
  contributionPct: number;
  /** Share of NET change. May be >100% or negative. */
  signedContributionPct: number | null;
  /** Share of ABSOLUTE movement. In [0,100]; sums to ~100 across the set. */
  magnitudeContributionPct: number | null;
}

export interface DriverContribution {
  driver: string;
  /** Absolute Shapley effect of this factor on the KPI, in KPI units. */
  contribution?: number;
  /** @deprecated Ambiguous. Equals signedContributionPct where exact. */
  contributionPct: number | null;
  signedContributionPct?: number | null;
  magnitudeContributionPct?: number | null;
  contributionType?: "exact" | "statistical" | "insufficient_data" | "not_exactly_decomposable";
  change: number;
  changePct: number | null;
  status?: "calculated" | "not_exactly_decomposable" | "insufficient_data";
  explanation?: string;
  /** True when the two-factor Shapley allocation reconciled to the total change. */
  reconciles?: boolean;
  reconciliationError?: number;
  /**
   * True when the interaction term was distributed between factors by Shapley
   * attribution rather than being reported as a separate residual. This is NOT
   * the same as "there is no interaction".
   */
  interactionAllocatedByShapley?: boolean;
}

/** Exact two-factor Shapley result with its reconciliation proof. */
export interface ShapleyDecomposition {
  factor1: number;
  factor2: number;
  totalChange: number;
  reconciliationError: number;
  reconciles: boolean;
  interactionAllocatedByShapley: true;
}

export interface AssociationResult {
  driver: string;
  /** Pearson r on the ALIGNED MOVEMENT series, not raw levels. */
  pearsonR: number | null;
  spearmanRho: number | null;
  /** Number of paired movement observations actually used. */
  sampleSize: number;
  associationStrength: "none" | "weak" | "moderate" | "strong";
  /** Two-tailed p-value for H0: rho = 0, from the Student t transform. */
  pValue?: number | null;
  /** pValue <= alpha. Evidence of non-zero linear association -- NOT causality. */
  isStatisticallySignificant?: boolean;
  alpha?: number;
  /** True when there were too few observations to test. r/rho are null in that case. */
  insufficientData?: boolean;
  /** Set when the driver has no SQL-backed history resolver at all. */
  unsupportedDriver?: boolean;
  reason?: string;
}

export interface TemporalAlignment {
  driver: string;
  /**
   * Lag L maximising |Corr(Driver_{t-L}, KPI_t)|.
   *   L > 0 driver leads KPI, L = 0 contemporaneous, L < 0 driver follows KPI.
   */
  bestLag: number;
  lagCorrelation: number;
  /** In [0,1]. Penalised when the driver FOLLOWS the KPI. */
  temporalScore: number;
  lagDirection?: "leads" | "contemporaneous" | "lags";
  sampleSize?: number;
  insufficientData?: boolean;
  /** Correlation at every tested lag, for display and debugging. */
  lagProfile?: Array<{ lag: number; correlation: number; n: number }>;
  reason?: string;
}

export interface SegmentConsistency {
  driver: string;
  /** consistentSegments / evaluatedSegments. */
  consistencyScore: number;
  consistentSegments: string[];
  inconsistentSegments: string[];
  /** Segments skipped for zero/undefined denominators -- NOT counted as inconsistent. */
  skippedSegments?: string[];
  evaluatedSegments?: number;
  insufficientData?: boolean;
  /** Segments where the KPI actually moved materially. */
  affectedSegments?: Array<{ segment: string; driverChangePct: number; kpiChangePct: number }>;
  unaffectedSegments?: Array<{ segment: string; driverChangePct: number; kpiChangePct: number }>;
  reason?: string;
}

export interface CounterSegmentComparison {
  driver: string;
  affectedSegments: { segment: string; change: number }[];
  unaffectedSegments: { segment: string; change: number }[];
  comparisonScore: number;
}

export interface Contradiction {
  driver: string;
  metric: string;
  expectedDirection: "positive" | "negative";
  observedDirection: "positive" | "negative";
  effect: "weakens" | "invalidates";
  magnitude: number;
  /** How the contradiction was established. */
  basis: "association" | "segment";
  /** Populated for association-based contradictions, which now require significance. */
  pValue?: number | null;
  sampleSize?: number;
  explanation?: string;
}

export interface EvidenceRequest {
  hypothesisId: string;
  metric: string;
  period: string;
  driver: string;
  query: string;
  filters: {
    region?: string;
    product?: string;
    dateStart?: string;
    dateEnd?: string;
  };
  requiredEvidence: string[];
}

/** Breakdown of how the evidence-availability score was derived (Task 13). */
export interface EvidenceAvailability {
  /** Fraction of required quantitative observations that actually exist, in [0,1]. */
  structuredEvidenceAvailability: number;
  /** Always 0 until Module 4 supplies real retrieved evidence. */
  unstructuredEvidenceAvailability: number;
  /** The score fed into the hypothesis weighting. */
  score: number;
  observedChecks: number;
  requiredChecks: number;
  missing: string[];
  note: string;
}

export interface DriverHypothesis {
  id: string;
  name: string;
  description: string;
  driver: string;
  claim: string;
  expectedDirection: "positive" | "negative";
  scope: {
    metric: string;
    period: string;
    region?: string;
    product?: string;
    channel?: string;
  };
  contributionPct?: number | null;
  signedContributionPct?: number | null;
  magnitudeContributionPct?: number | null;
  /** Raw Pearson r on the movement series. */
  associationScore?: number | null;
  pValue?: number | null;
  isStatisticallySignificant?: boolean;
  sampleSize?: number;
  temporalAlignment?: number | null;
  bestLag?: number;
  lagDirection?: "leads" | "contemporaneous" | "lags";
  segmentConsistency?: number | null;
  causalPlausibility?: number | null;
  evidenceAvailability?: number | null;
  evidenceDetail?: EvidenceAvailability;
  /** Weighted sum before the contradiction penalty. */
  score: number;
  /** Score after the contradiction penalty, clamped to [0,1]. */
  confidence: number;
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  caveats: string[];
  contradictions?: Contradiction[];
  /** Per-component scores actually fed into the weighted sum. */
  scoreBreakdown?: {
    contribution: number;
    association: number;
    temporal: number;
    segmentConsistency: number;
    causalPlausibility: number;
    evidenceAvailability: number;
    contradictionPenalty: number;
  };
}

export interface DriverAnalysis {
  metric: string;
  period: string;
  totalChange: number;
  totalChangePct: number;
  dimensions: DimensionContribution[];
  /** Exact algebraic decomposition of the KPI into its factors. */
  contributions?: DriverContribution[];
  drivers: DriverHypothesis[];
  alternatives: DriverHypothesis[];
  contradictions: Contradiction[];
  evidenceRequests: EvidenceRequest[];
  confidence: number;
  /** Drivers with no SQL-backed resolver, and why. */
  unsupportedDrivers?: Array<{ driver: string; reason: string }>;
  /** Dimension used to evaluate segment consistency for this scope. */
  segmentationDimension?: string;
}

export interface DriverDefinition {
  id: string;
  name: string;
  description: string;
  parentKPI: string;
  sourceTables: string[];
  sourceColumns: string[];
  calculation: string;
  dimensions: string[];
  expectedDirection: "positive" | "negative";
  controllable: boolean;
  candidateLevers: string[];
}
