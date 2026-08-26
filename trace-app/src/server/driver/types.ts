export interface DimensionContribution {
  dimension: string;
  dimensionValue: string;
  change: number;
  changePct: number | null;
  contributionPct: number;
  signedContributionPct?: number | null;
  magnitudeContributionPct?: number | null;
}

export interface DriverContribution {
  driver: string;
  contributionPct: number | null;
  signedContributionPct?: number | null;
  magnitudeContributionPct?: number | null;
  contributionType?: "exact" | "statistical" | "insufficient_data" | "not_exactly_decomposable";
  change: number;
  changePct: number | null;
  status?: "calculated" | "not_exactly_decomposable" | "insufficient_data";
  explanation?: string;
}

export interface AssociationResult {
  driver: string;
  pearsonR: number | null;
  spearmanRho: number | null;
  sampleSize: number;
  associationStrength: "none" | "weak" | "moderate" | "strong";
  pValue?: number;
  insufficientData?: boolean;
}

export interface TemporalAlignment {
  driver: string;
  bestLag: number;
  lagCorrelation: number;
  temporalScore: number;
}

export interface SegmentConsistency {
  driver: string;
  consistencyScore: number;
  consistentSegments: string[];
  inconsistentSegments: string[];
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
  associationScore?: number | null;
  temporalAlignment?: number | null;
  segmentConsistency?: number | null;
  causalPlausibility?: number | null;
  evidenceAvailability?: number | null;
  score: number;
  confidence: number;
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  caveats: string[];
}

export interface DriverAnalysis {
  metric: string;
  period: string;
  totalChange: number;
  totalChangePct: number;
  dimensions: DimensionContribution[];
  drivers: DriverHypothesis[];
  alternatives: DriverHypothesis[];
  contradictions: Contradiction[];
  evidenceRequests: EvidenceRequest[];
  confidence: number;
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