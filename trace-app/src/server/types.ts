export interface EvidenceItem {
  id: number;
  text: string;
  source: string;
  region: string;
  topic: string;
  date: string;
  product?: string;
  embedding?: number[];
}

export interface RetrievedEvidence extends EvidenceItem {
  relevance: number;
  recency: number;
  reliability: number;
  independence: number;
  stance: 'support' | 'contradict' | 'neutral';
  weight: number;
}

export interface StructuredSignal {
  metric: string;
  currentValue: number;
  baselineMean: number;
  baselineStd: number;
  zScore: number | null;
  deltaPct: number | null;
  available: boolean;
  /** 0 (no structural support) to 1 (strong structural support) for this specific hypothesis. */
  supportStrength: number;
  note?: string;
}

export interface HypothesisResult {
  id: number;
  key: string;
  description: string;
  dataAvailable: boolean;
  rawConfidence: number;
  confidence: number;
  structuredSignal: StructuredSignal;
  supportEvidence: RetrievedEvidence[];
  contradictingEvidence: RetrievedEvidence[];
  breakdown: {
    structuredContribution: number;
    unstructuredContribution: number;
    contradictionPenalty: number;
  };
  rationale: string;
}

export interface UncertaintyReport {
  metric: string;
  month: string;
  region?: string;
  dataCompletenessPct: number;
  missingDataSources: string[];
  contradictions: Array<{
    hypothesis: string;
    supportingSignal: string;
    contradictingSignal: string;
    note: string;
  }>;
  confidenceAdjustments: Array<{
    hypothesis: string;
    before: number;
    after: number;
    reason: string;
  }>;
  ambiguous: boolean;
  topHypothesis: string | null;
  abstentionMessage?: string;
  recommendedDataCollection: string[];
  // backward-compatible field
  uncertainty_pct: number;
}

export interface DecisionItem {
  id?: number;
  kpi: string;
  action: string;
  timestamp: string;
}

export interface KPIResponse {
  metric: string;
  label: string;
  period: string;
  month: string; // backward compatibility
  value: number;
  previousValue: number;
  changePct: number;
  unit: string;
  dimensions: {
    region?: string;
    product?: string;
    channel?: string;
  };
  source: {
    table: string;
    columns: string[];
  };
  lineage: {
    formula: string;
    filters: Record<string, string | undefined>;
    generatedAt: string;
  };
  quality: {
    status: 'good' | 'warning' | 'critical';
    completenessPct: number;
  };
  freshness: {
    status: 'fresh' | 'stale' | 'critical';
    source: string;
  };
  is_anomaly?: boolean;
  severity?: 'low' | 'medium' | 'high';
  baseline?: {
    mean: number;
    std: number;
    sampleSize: number;
    deltaFromBaselinePct: number;
  };
  zScore?: number;
  normalRange?: { low: number; high: number };
}

export interface KPIHistoryResponse {
  metric: string;
  label: string;
  unit: string;
  periods: Array<{
    period: string;
    value: number;
  }>;
}

export interface KPIBreakdownResponse {
  metric: string;
  label: string;
  period: string;
  dimension: string;
  breakdown: Array<{
    dimensionValue: string;
    value: number;
    contributionPct: number;
  }>;
}

export interface KPIMetadataResponse {
  metric: string;
  label: string;
  description: string;
  formula: string;
  source: string;
  sourceColumns: string[];
  dimensions: string[];
  unit: string;
  drivers: string[];
  aggregation: string;
  refreshCadence: string;
  materialityThreshold: { absolute?: number; relative?: number };
}

export interface DataQualityResponse {
  completenessPct: number;
  nullRatePct: number;
  duplicateRatePct: number;
  referentialIntegrityPct: number;
  status: 'good' | 'warning' | 'critical';
  details: {
    salesTransactions: { total: number; nullNetRevenue: number; nullOrderId: number; duplicateOrderId: number };
    marketingDaily: { total: number; nullSessions: number; nullConversions: number };
    operationsDaily: { total: number; nullStockoutRate: number; invalidStockoutRate: number };
  };
}

export interface FreshnessResponse {
  sources: Array<{
    source: string;
    sourceType: string;
    grain: string;
    refreshCadence: string;
    lastRefreshedAt: string;
    freshnessStatus: 'fresh' | 'stale' | 'critical';
    hoursSinceRefresh: number;
  }>;
}