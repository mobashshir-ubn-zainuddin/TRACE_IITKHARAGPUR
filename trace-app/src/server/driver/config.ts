export interface DriverConfig {
  minimumCorrelationSamples: number;
  minHistoryPeriods: number;
  /** Significance level for correlation tests. p <= alpha => statistically significant. */
  significanceAlpha: number;
  correlationThresholds: {
    none: number;
    weak: number;
    moderate: number;
    strong: number;
  };
  contributionThresholds: {
    minor: number;
    moderate: number;
    major: number;
  };
  temporalAlignment: {
    /** Most negative lag tested. Negative lag = driver FOLLOWS the KPI. */
    minLagMonths: number;
    /** Most positive lag tested. Positive lag = driver LEADS the KPI. */
    maxLagMonths: number;
    alignmentThreshold: number;
    /** Minimum paired observations required at a given lag for it to be considered. */
    minObservations: number;
    /**
     * Multiplier applied to the temporal score when the driver FOLLOWS the KPI.
     * A driver that only moves after the KPI cannot explain the KPI movement,
     * so it must not receive strong temporal support.
     */
    lagsPenaltyFactor: number;
    /** Multiplier when driver and KPI move contemporaneously (no precedence shown). */
    contemporaneousFactor: number;
  };
  segmentConsistency: {
    minSegmentsForConsistency: number;
    consistencyThreshold: number;
    /** Relative change below which a segment is treated as "did not move". */
    materialChangePct: number;
  };
  contradiction: {
    /** Association-based contradictions require at least this many observations. */
    minSampleSize: number;
    /** ...and a p-value at or below this. */
    alpha: number;
    /** ...and |r| at least this large, so trivial-but-significant effects don't trigger. */
    minAbsCorrelation: number;
    /** Fraction of segments that must contradict before a segment-level contradiction is raised. */
    segmentContradictionThreshold: number;
  };
  hypothesisWeights: {
    contribution: number;
    association: number;
    temporal: number;
    segmentConsistency: number;
    causalPlausibility: number;
    evidenceAvailability: number;
  };
  hypothesisThresholds: {
    strongCandidate: number;
    candidate: number;
    weakCandidate: number;
  };
  ambiguityMargin: number;
  contradictionPenalties: {
    weakens: number;
    invalidates: number;
  };
  evidenceAvailabilityWeights: {
    structured: number;
    unstructured: number;
  };
}

export const DEFAULT_DRIVER_CONFIG: DriverConfig = {
  minimumCorrelationSamples: 6,
  minHistoryPeriods: 3,
  significanceAlpha: 0.05,
  correlationThresholds: {
    none: 0.3,
    weak: 0.5,
    moderate: 0.7,
    strong: 0.85,
  },
  contributionThresholds: {
    minor: 0.05,
    moderate: 0.15,
    major: 0.3,
  },
  temporalAlignment: {
    // Task 9: the search must be symmetric. Testing only 0..+3 cannot distinguish
    // "driver leads KPI" from "driver follows KPI".
    minLagMonths: -3,
    maxLagMonths: 3,
    alignmentThreshold: 0.5,
    minObservations: 5,
    lagsPenaltyFactor: 0.25,
    contemporaneousFactor: 0.7,
  },
  segmentConsistency: {
    minSegmentsForConsistency: 2,
    consistencyThreshold: 0.7,
    materialChangePct: 1.0,
  },
  contradiction: {
    minSampleSize: 6,
    alpha: 0.05,
    minAbsCorrelation: 0.3,
    segmentContradictionThreshold: 0.5,
  },
  hypothesisWeights: {
    contribution: 0.30,
    association: 0.20,
    temporal: 0.15,
    segmentConsistency: 0.15,
    causalPlausibility: 0.10,
    evidenceAvailability: 0.10,
  },
  hypothesisThresholds: {
    strongCandidate: 0.75,
    candidate: 0.5,
    weakCandidate: 0.25,
  },
  ambiguityMargin: 0.05,
  contradictionPenalties: {
    weakens: 0.15,
    invalidates: 0.35,
  },
  evidenceAvailabilityWeights: {
    structured: 1.0,
    // Stays 0-weighted until Module 4 supplies real retrieved evidence.
    unstructured: 0.0,
  },
};
