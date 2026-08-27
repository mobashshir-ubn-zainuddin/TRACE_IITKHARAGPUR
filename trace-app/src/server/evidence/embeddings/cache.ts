/**
 * Module 4: Embedding Cache Management
 * 
 * Utilities for managing embedding cache persistence and invalidation.
 */

import { getDB } from "../../db";

export interface EmbeddingCacheStats {
  totalEntries: number;
  modelDistribution: Record<string, number>;
  dimensionDistribution: Record<number, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
  totalSizeBytes: number;
}

/** Get cache statistics */
export async function getEmbeddingCacheStats(): Promise<EmbeddingCacheStats> {
  const db = await getDB();
  
  const rows = await db.all(`
    SELECT model, dimension, content_hash, embedding, created_at
    FROM embeddings
  `);
  
  const modelDist: Record<string, number> = {};
  const dimDist: Record<number, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;
  let totalBytes = 0;
  
  for (const row of rows) {
    modelDist[row.model] = (modelDist[row.model] || 0) + 1;
    dimDist[row.dimension] = (dimDist[row.dimension] || 0) + 1;
    
    if (!oldest || row.created_at < oldest) oldest = row.created_at;
    if (!newest || row.created_at > newest) newest = row.created_at;
    
    totalBytes += row.embedding.length;
  }
  
  return {
    totalEntries: rows.length,
    modelDistribution: modelDist,
    dimensionDistribution: dimDist,
    oldestEntry: oldest,
    newestEntry: newest,
    totalSizeBytes: totalBytes,
  };
}

/** Clear embeddings for a specific model */
export async function clearModelEmbeddings(model: string): Promise<number> {
  const db = await getDB();
  const result = await db.run(`DELETE FROM embeddings WHERE model = ?`, model);
  return result.changes ?? 0;
}

/** Clear all embeddings */
export async function clearAllEmbeddings(): Promise<number> {
  const db = await getDB();
  const result = await db.run(`DELETE FROM embeddings`);
  return result.changes ?? 0;
}

/** Clear embeddings older than specified date */
export async function clearOldEmbeddings(beforeDate: string): Promise<number> {
  const db = await getDB();
  const result = await db.run(`DELETE FROM embeddings WHERE created_at < ?`, beforeDate);
  return result.changes ?? 0;
}

/** Vacuum embeddings table to reclaim space */
export async function vacuumEmbeddings(): Promise<void> {
  const db = await getDB();
  await db.exec(`VACUUM;`);
}

/** Get cache hit rate (requires telemetry tracking) */
export interface CacheHitRate {
  hits: number;
  misses: number;
  hitRate: number;
}

export async function getCacheHitRate(
  model: string,
  dimension: number
): Promise<CacheHitRate> {
  // This would require telemetry tracking which we can add later
  return { hits: 0, misses: 0, hitRate: 0 };
}