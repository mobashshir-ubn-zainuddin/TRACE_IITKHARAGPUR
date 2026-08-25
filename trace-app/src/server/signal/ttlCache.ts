interface TTLCacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TTLMap<K, V> {
  private cache = new Map<K, TTLCacheEntry<V>>();
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 60000) {
    this.defaultTTL = defaultTTLMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

import { DataQualityResult } from "../types";
import { SourceFreshness } from "../kpi/freshness";

export const dataQualityCache = new TTLMap<string, DataQualityResult>(60000);
export const freshnessCache = new TTLMap<string, SourceFreshness[]>(60000);

export function makeDataQualityKey(): string {
  return 'global';
}

export function makeFreshnessKey(metric: string): string {
  return `freshness:${metric}`;
}