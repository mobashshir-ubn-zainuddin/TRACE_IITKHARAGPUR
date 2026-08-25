export interface EvidenceItem {
  id: number;
  text: string;
  source: string;
  region: string;
  topic: string;
  date: string;
  embedding?: number[];
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
  quality: DataQualityResult;
  freshness: SourceFreshness;
  is_anomaly?: boolean;
  severity?: 'low' | 'medium' | 'high';
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

export interface MaterialityResult {
  level: "low" | "medium" | "high";
  absoluteImpact: number;
  relativeImpact: number;
  exceedsAbsoluteThreshold: boolean;
  exceedsRelativeThreshold: boolean;
}

export interface DataQualityResult {
  completenessPct: number;
  nullRatePct: number;
  duplicateRatePct: number;
  referentialIntegrityPct: number;
  status: 'good' | 'warning' | 'critical';
  details: {
    salesTransactions: { 
      total: number; 
      nullNetRevenue: number; 
      nullOrderId: number; 
      duplicateTransactionId: number; 
      orphanRegionId: number;
      orphanProductId: number;
    };
    marketingDaily: { 
      total: number; 
      nullSessions: number; 
      nullConversions: number;
      orphanRegionId: number;
      orphanProductId: number;
    };
    operationsDaily: { 
      total: number; 
      nullStockoutRate: number; 
      invalidStockoutRate: number;
      orphanRegionId: number;
      orphanProductId: number;
    };
  };
}

export interface SourceFreshness {
  source: string;
  sourceType: string;
  grain: string;
  refreshCadence: string;
  lastRefreshedAt: string;
  freshnessStatus: 'fresh' | 'stale' | 'critical';
  hoursSinceRefresh: number;
  status: 'fresh' | 'stale' | 'critical';
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

export type SignalReasonCode =
  | "LARGE_MOM_CHANGE"
  | "LARGE_YOY_CHANGE"
  | "HIGH_Z_SCORE"
  | "HIGH_ROBUST_Z_SCORE"
  | "HIGH_MATERIALITY"
  | "SEASONAL_PATTERN"
  | "SPARSE_HISTORY"
  | "STALE_DATA"
  | "LOW_COMPLETENESS"
  | "HIGH_VOLATILITY"
  | "NEW_KPI";

export interface KPISignal {
  id: string;

  metric: string;
  period: string;

  currentValue: number;
  previousValue: number;

  absoluteChange: number;
  changePct: number;

  baseline: {
    mean: number;
    median: number;
    stdDev: number;
    mad?: number;
    percentiles?: {
      p10?: number;
      p25?: number;
      p50?: number;
      p75?: number;
      p90?: number;
    };
  };

  deviation: {
    zScore?: number;
    robustZScore?: number;
  };

  seasonality: {
    adjusted: boolean;
    yoyChangePct?: number;
  };

  statisticalSignificance:
    | "none"
    | "low"
    | "medium"
    | "high";

  materiality:
    | "low"
    | "medium"
    | "high";

  signalStrength: number;

  priority:
    | "low"
    | "medium"
    | "high"
    | "critical";

  status:
    | "normal"
    | "watch"
    | "investigate"
    | "urgent";

  confidence: number;

  dataQualityImpact: number;

  reasons: string[];

  reasonCodes: SignalReasonCode[];

  explanation: {
    summary: {
      direction: "up" | "down" | "flat";
      magnitudePct: number;
      materiality: "low" | "medium" | "high";
      statisticalSignificance:
        | "none"
        | "low"
        | "medium"
        | "high";
    };
    reasons: string[];
  };

  dimensions?: Record<string, string>;

  candidateInvestigationWindow?: {
    start: string;
    end: string;
  };

  telemetry?: {
    calculationLatencyMs: number;
    historyLength: number;
    method: string[];
  };
}

export interface ScoringResult {
  signalStrength: number;
  priority: "low" | "medium" | "high" | "critical";
  status: "normal" | "watch" | "investigate" | "urgent";
  confidence: number;
  dataQualityImpact: number;
  reasonCodes: string[];
  reasons: string[];
  explanation: {
    summary: {
      direction: "up" | "down" | "flat";
      magnitudePct: number;
      materiality: "low" | "medium" | "high";
      statisticalSignificance: "none" | "low" | "medium" | "high";
    };
    reasons: string[];
  };
}