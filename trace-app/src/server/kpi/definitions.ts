export interface KPIDefinition {
  name: string;
  label: string;
  description: string;
  formula: string;
  source: string;
  sourceColumns: string[];
  dimensions: string[];
  unit: string;
  drivers: string[];
  aggregation: 'sum' | 'count_distinct' | 'ratio' | 'derived';
  refreshCadence: string;
  materialityThreshold: { absolute?: number; relative?: number };
}

export const KPI_DEFINITIONS: Record<string, KPIDefinition> = {
  revenue: {
    name: 'revenue',
    label: 'Revenue',
    description: 'Total net revenue from sales transactions',
    formula: 'SUM(net_revenue)',
    source: 'sales_transactions',
    sourceColumns: ['net_revenue'],
    dimensions: ['region', 'product', 'channel'],
    unit: 'currency',
    drivers: ['orders', 'aov', 'price', 'mix', 'discounts'],
    aggregation: 'sum',
    refreshCadence: 'near-real-time',
    materialityThreshold: { absolute: 500000, relative: 0.03 }
  },
  orders: {
    name: 'orders',
    label: 'Orders',
    description: 'Count of distinct orders',
    formula: 'COUNT(DISTINCT order_id)',
    source: 'sales_transactions',
    sourceColumns: ['order_id'],
    dimensions: ['region', 'product', 'channel'],
    unit: 'count',
    drivers: ['sessions', 'conversion', 'availability'],
    aggregation: 'count_distinct',
    refreshCadence: 'near-real-time',
    materialityThreshold: { absolute: 500, relative: 0.05 }
  },
  aov: {
    name: 'aov',
    label: 'Average Order Value',
    description: 'Revenue per order (derived, not summed)',
    formula: 'SUM(net_revenue) / COUNT(DISTINCT order_id)',
    source: 'sales_transactions',
    sourceColumns: ['net_revenue', 'order_id'],
    dimensions: ['region', 'product', 'channel'],
    unit: 'currency',
    drivers: ['price', 'discount', 'product_mix'],
    aggregation: 'derived',
    refreshCadence: 'near-real-time',
    materialityThreshold: { relative: 0.03 }
  },
  conversion: {
    name: 'conversion',
    label: 'Conversion Rate',
    description: 'Marketing conversions per session',
    formula: 'SUM(conversions) / SUM(sessions)',
    source: 'marketing_daily',
    sourceColumns: ['conversions', 'sessions'],
    dimensions: ['region', 'product'],
    unit: 'percentage',
    drivers: ['campaign', 'channel', 'traffic_quality'],
    aggregation: 'ratio',
    refreshCadence: 'daily',
    materialityThreshold: { absolute: 0.02, relative: 0.10 }
  },
  marketingROI: {
    name: 'marketingROI',
    label: 'Marketing ROI',
    description: 'Attributed revenue per marketing spend',
    formula: 'SUM(attributed_revenue) / SUM(marketing_spend)',
    source: 'marketing_daily',
    sourceColumns: ['attributed_revenue', 'marketing_spend'],
    dimensions: ['region', 'product'],
    unit: 'ratio',
    drivers: ['spend', 'conversion', 'campaign'],
    aggregation: 'ratio',
    refreshCadence: 'daily',
    materialityThreshold: { absolute: 0.2, relative: 0.15 }
  }
};

export function getKPIDefinition(name: string): KPIDefinition | undefined {
  return KPI_DEFINITIONS[name];
}

export function getAllKPIMetrics(): string[] {
  return Object.keys(KPI_DEFINITIONS);
}