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

export interface SignalConfig {
  minHistoryPeriods: number;
  baselineWindowMonths: number;
  zScoreThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  robustZScoreThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  materialityThresholds: Record<string, { absolute?: number; relative?: number }>;
  signalWeights: {
    statistical: number;
    materiality: number;
    historicalConfidence: number;
    dataQuality: number;
    seasonality: number;
  };
  priorityThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  statusThresholds: {
    watch: number;
    investigate: number;
    urgent: number;
  };
  confidencePenalties: {
    lowCompleteness: number;
    staleData: number;
    sparseHistory: number;
    highVolatility: number;
  };
  seasonality: {
    enabled: boolean;
    minHistoryMonths: number;
  };
  sparseHistory: {
    minPeriods: number;
    lowConfidenceThreshold: number;
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

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  minHistoryPeriods: 3,
  baselineWindowMonths: 6,
  zScoreThresholds: {
    low: 1,
    medium: 2,
    high: 3,
  },
  robustZScoreThresholds: {
    low: 1,
    medium: 2,
    high: 3,
  },
  materialityThresholds: {
    revenue: { absolute: 500000, relative: 0.03 },
    orders: { absolute: 500, relative: 0.05 },
    aov: { relative: 0.03 },
    conversion: { absolute: 2.0, relative: 0.10 },
    marketingROI: { absolute: 0.2, relative: 0.15 },
  },
  signalWeights: {
    statistical: 0.35,
    materiality: 0.30,
    historicalConfidence: 0.15,
    dataQuality: 0.10,
    seasonality: 0.10,
  },
  priorityThresholds: {
    low: 0.25,
    medium: 0.50,
    high: 0.75,
    critical: 1.00,
  },
  statusThresholds: {
    watch: 0.35,
    investigate: 0.55,
    urgent: 0.85,
  },
  confidencePenalties: {
    lowCompleteness: 0.20,
    staleData: 0.15,
    sparseHistory: 0.25,
    highVolatility: 0.10,
  },
  seasonality: {
    enabled: true,
    minHistoryMonths: 12,
  },
  sparseHistory: {
    minPeriods: 6,
    lowConfidenceThreshold: 0.4,
  },
};