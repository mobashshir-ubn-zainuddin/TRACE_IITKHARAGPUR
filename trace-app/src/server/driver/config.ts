export interface DriverConfig {
  minimumCorrelationSamples: number;
  minHistoryPeriods: number;
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
    maxLagMonths: number;
    alignmentThreshold: number;
  };
  segmentConsistency: {
    minSegmentsForConsistency: number;
    consistencyThreshold: number;
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
    maxLagMonths: 3,
    alignmentThreshold: 0.5,
  },
  segmentConsistency: {
    minSegmentsForConsistency: 2,
    consistencyThreshold: 0.7,
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
    unstructured: 0.6,
  },
};