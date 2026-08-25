import type { KPIResponse } from "../types";
import type { BaselineResult } from "./cache";
import type { KPISignal } from "../types";

interface InFlightEntry<T> {
  promise: Promise<T>;
  abortController: AbortController | null;
}

class InFlightMap<K, T> {
  private map = new Map<K, InFlightEntry<T>>();

  async getOrCreate(
    key: K,
    factory: (abortSignal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const existing = this.map.get(key);
    if (existing) {
      return existing.promise;
    }

    const abortController = new AbortController();
    const promise = factory(abortController.signal)
      .finally(() => {
        this.map.delete(key);
      });

    this.map.set(key, { promise, abortController });
    return promise;
  }

  abort(key: K): void {
    const entry = this.map.get(key);
    if (entry && entry.abortController) {
      entry.abortController.abort();
    }
    this.map.delete(key);
  }

  abortAll(): void {
    for (const entry of this.map.values()) {
      if (entry.abortController) {
        entry.abortController.abort();
      }
    }
    this.map.clear();
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

// Shared in-flight maps for expensive operations
export const kpiInFlight = new InFlightMap<string, KPIResponse>();
export const historyInFlight = new InFlightMap<string, Array<{ period: string; value: number }>>();
export const baselineInFlight = new InFlightMap<string, BaselineResult>();
export const signalInFlight = new InFlightMap<string, KPISignal>();

export function makeKPIInFlightKey(metric: string, period: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:${period}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

export function makeHistoryInFlightKey(metric: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:history:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

export function makeBaselineInFlightKey(metric: string, period: string, windowMonths: number, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:baseline:${period}:${windowMonths}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}

export function makeSignalInFlightKey(metric: string, period: string, filters?: { region?: string; product?: string; channel?: string }): string {
  return `${metric}:${period}:${filters?.region || 'all'}:${filters?.product || 'all'}:${filters?.channel || 'all'}`;
}