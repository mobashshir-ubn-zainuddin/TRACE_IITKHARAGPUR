import { getDB } from "../db";
import { getKPIDefinition } from "./definitions";

export interface SourceFreshness {
  source: string;
  sourceType: string;
  grain: string;
  refreshCadence: string;
  lastRefreshedAt: string;
  freshnessStatus: 'fresh' | 'stale' | 'critical';
  hoursSinceRefresh: number;
}

// Explicit mapping from KPI source table to data_sources.name
const SOURCE_TABLE_TO_DATA_SOURCE: Record<string, string> = {
  'sales_transactions': 'Sales System',
  'marketing_daily': 'Marketing Platform',
  'operations_daily': 'Operations System',
};

export async function computeFreshness(metric?: string): Promise<SourceFreshness[]> {
  const db = await getDB();
  const sources = await db.all("SELECT * FROM data_sources");
  const now = new Date();

  // If metric is provided, filter to only the relevant source using explicit mapping
  let relevantSources = sources;
  if (metric) {
    const def = getKPIDefinition(metric);
    if (def) {
      const sourceName = SOURCE_TABLE_TO_DATA_SOURCE[def.source];
      if (sourceName) {
        relevantSources = sources.filter(s => s.name === sourceName);
        if (relevantSources.length === 0) {
          throw new Error(`No data source found for KPI source table: ${def.source}`);
        }
      } else {
        throw new Error(`No data source mapping for KPI source table: ${def.source}`);
      }
    }
  }

  return relevantSources.map(s => {
    const lastRefresh = new Date(s.last_refreshed_at);
    const hoursSince = (now.getTime() - lastRefresh.getTime()) / (1000 * 60 * 60);
    
    // Handle future timestamps
    const safeHoursSince = hoursSince < 0 ? 0 : hoursSince;
    
    let status: 'fresh' | 'stale' | 'critical' = 'fresh';
    if (s.refresh_cadence === 'near-real-time' && safeHoursSince > 2) status = 'stale';
    if (s.refresh_cadence === 'near-real-time' && safeHoursSince > 6) status = 'critical';
    if (s.refresh_cadence === 'daily' && safeHoursSince > 36) status = 'stale';
    if (s.refresh_cadence === 'daily' && safeHoursSince > 72) status = 'critical';
    if (s.refresh_cadence === '6-hourly' && safeHoursSince > 12) status = 'stale';
    if (s.refresh_cadence === '6-hourly' && safeHoursSince > 24) status = 'critical';

    return {
      source: s.name,
      sourceType: s.source_type,
      grain: s.grain,
      refreshCadence: s.refresh_cadence,
      lastRefreshedAt: s.last_refreshed_at,
      freshnessStatus: status,
      hoursSinceRefresh: Math.round(safeHoursSince * 10) / 10
    };
  });
}