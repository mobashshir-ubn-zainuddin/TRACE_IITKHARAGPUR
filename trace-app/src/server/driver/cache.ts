/**
 * Short-lived, deterministic in-memory cache for Module 3 driver analysis.
 *
 * Module 3 analysis is a pure function of (metric, period, filters) over an
 * immutable snapshot of the warehouse, so results are safe to memoize for a
 * short window. The dashboard issues several overlapping requests for the same
 * scope (drivers + hypotheses + breakdowns), which previously recomputed the
 * identical SQL repeatedly.
 *
 * Two mechanisms:
 *   1. TTL cache      - reuses a completed result for `ttlMs`.
 *   2. In-flight map  - coalesces *concurrent* callers onto one promise, so N
 *                       simultaneous requests for the same key trigger one
 *                       computation instead of N. This is what stops the
 *                       dashboard's parallel fetches from stampeding.
 *
 * The cache is intentionally short-lived and explicitly invalidatable; nothing
 * is cached indefinitely.
 */

export const DRIVER_CACHE_TTL_MS = 45_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  coalesced: number;
}

class DriverCache {
  private entries = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, coalesced: 0 };

  /**
   * Returns the cached value for `key`, or computes it via `compute()`.
   * Concurrent callers with the same key share a single computation.
   */
  async getOrCompute<T>(key: string, compute: () => Promise<T>, ttlMs: number = DRIVER_CACHE_TTL_MS): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && Date.now() <= entry.expiresAt) {
      this.stats.hits++;
      return entry.value as T;
    }
    if (entry) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) {
      this.stats.coalesced++;
      return pending as Promise<T>;
    }

    this.stats.misses++;
    const promise = (async () => {
      try {
        const value = await compute();
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = DRIVER_CACHE_TTL_MS): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Invalidate one key, or every key sharing a prefix (e.g. all of one metric). */
  invalidate(keyOrPrefix: string, prefix = false): void {
    if (!prefix) {
      this.entries.delete(keyOrPrefix);
      return;
    }
    for (const k of [...this.entries.keys()]) {
      if (k.startsWith(keyOrPrefix)) this.entries.delete(k);
    }
  }

  /** Drop everything. Call after a data reload so analysis never serves stale rows. */
  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  getStats(): CacheStats & { size: number } {
    return { ...this.stats, size: this.entries.size };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, coalesced: 0 };
  }
}

export const driverCache = new DriverCache();

export interface DriverCacheScope {
  metric: string;
  period: string;
  region?: string;
  product?: string;
  channel?: string;
}

/**
 * Deterministic cache key: `namespace|metric|period|region|product|channel`.
 * Undefined filters collapse to the empty string, so
 * `makeDriverCacheKey("analysis", { metric: "revenue", period: "2026-08", region: "North" })`
 * yields `analysis|revenue|2026-08|North||`.
 */
export function makeDriverCacheKey(namespace: string, scope: DriverCacheScope): string {
  return [
    namespace,
    scope.metric,
    scope.period,
    scope.region ?? "",
    scope.product ?? "",
    scope.channel ?? "",
  ].join("|");
}

/** Key for a driver-history series, which is scoped by driver + window rather than period. */
export function makeHistoryCacheKey(
  driverId: string,
  months: string[],
  filters?: { region?: string; product?: string; channel?: string; campaign?: string }
): string {
  const window = months.length > 0 ? `${months[0]}..${months[months.length - 1]}:${months.length}` : "empty";
  return [
    "history",
    driverId,
    window,
    filters?.region ?? "",
    filters?.product ?? "",
    filters?.channel ?? "",
    filters?.campaign ?? "",
  ].join("|");
}
