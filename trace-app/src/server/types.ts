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