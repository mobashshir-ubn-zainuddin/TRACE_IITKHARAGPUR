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

export async function computeFreshness(metric?: string): Promise<SourceFreshness[]> {
  const db = await getDB();
  const sources = await db.all("SELECT * FROM data_sources");
  const now = new Date();

  // If metric is provided, filter to only the relevant source
  let relevantSources = sources;
  if (metric) {
    const def = getKPIDefinition(metric);
    if (def) {
      relevantSources = sources.filter(s => s.source_type === def.source.split('_')[0] || s.name.toLowerCase().includes(def.source.split('_')[0]));
      if (relevantSources.length === 0) {
        relevantSources = sources; // fallback to all sources
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