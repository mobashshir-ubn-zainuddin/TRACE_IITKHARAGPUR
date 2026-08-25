import { getKPIDefinition } from "./definitions";

export interface KPILineage {
  kpi: string;
  formula: string;
  sourceTable: string;
  sourceColumns: string[];
  dimensions: Record<string, string | undefined>;
  calculation: string;
  filters: Record<string, string | undefined>;
  generatedAt: string;
}

export function buildLineage(
  metric: string,
  filters: { month?: string; region?: string; product?: string; channel?: string }
): KPILineage {
  const def = getKPIDefinition(metric);
  if (!def) {
    return {
      kpi: metric,
      formula: 'unknown',
      sourceTable: 'unknown',
      sourceColumns: [],
      dimensions: {},
      calculation: 'unknown',
      filters,
      generatedAt: new Date().toISOString()
    };
  }

  return {
    kpi: def.name,
    formula: def.formula,
    sourceTable: def.source,
    sourceColumns: def.sourceColumns,
    dimensions: def.dimensions.reduce((acc, d) => ({ ...acc, [d]: filters[d as keyof typeof filters] }), {}),
    calculation: def.aggregation,
    filters,
    generatedAt: new Date().toISOString()
  };
}