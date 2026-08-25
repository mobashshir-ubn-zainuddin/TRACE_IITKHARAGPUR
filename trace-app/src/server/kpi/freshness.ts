import { getDB } from "../db";

export interface SourceFreshness {
  source: string;
  sourceType: string;
  grain: string;
  refreshCadence: string;
  lastRefreshedAt: string;
  freshnessStatus: 'fresh' | 'stale' | 'critical';
  hoursSinceRefresh: number;
}

export async function computeFreshness(): Promise<SourceFreshness[]> {
  const db = await getDB();
  const sources = await db.all("SELECT * FROM data_sources");
  const now = new Date();

  return sources.map(s => {
    const lastRefresh = new Date(s.last_refreshed_at);
    const hoursSince = (now.getTime() - lastRefresh.getTime()) / (1000 * 60 * 60);
    
    let status: 'fresh' | 'stale' | 'critical' = 'fresh';
    if (s.refresh_cadence === 'near-real-time' && hoursSince > 2) status = 'stale';
    if (s.refresh_cadence === 'near-real-time' && hoursSince > 6) status = 'critical';
    if (s.refresh_cadence === 'daily' && hoursSince > 36) status = 'stale';
    if (s.refresh_cadence === 'daily' && hoursSince > 72) status = 'critical';
    if (s.refresh_cadence === '6-hourly' && hoursSince > 12) status = 'stale';
    if (s.refresh_cadence === '6-hourly' && hoursSince > 24) status = 'critical';

    return {
      source: s.name,
      sourceType: s.source_type,
      grain: s.grain,
      refreshCadence: s.refresh_cadence,
      lastRefreshedAt: s.last_refreshed_at,
      freshnessStatus: status,
      hoursSinceRefresh: Math.round(hoursSince * 10) / 10
    };
  });
}