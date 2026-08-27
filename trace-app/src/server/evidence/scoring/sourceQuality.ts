/**
 * Module 4: Source Quality Scoring
 * 
 * Not all sources have equal authority. Source quality weights are configurable.
 * 
 * Default weights:
 * - ERP/structured source = 1.00
 * - Official internal report = 0.90
 * - Operations report = 0.90
 * - Support ticket = 0.70
 * - Customer review = 0.60
 * - Unverified source = 0.40
 */

import type { EvidenceItem, EvidenceSourceType } from "../types";

/** Default source quality weights */
export const DEFAULT_SOURCE_QUALITY: Record<EvidenceSourceType, number> = {
  structured: 1.00,
  internal_report: 0.90,
  operations_report: 0.90,
  support_ticket: 0.70,
  customer_review: 0.60,
  marketing_report: 0.75,
  pricing_report: 0.80,
  fulfillment_report: 0.80,
  inventory_report: 0.85,
  sales_transactions: 1.00,
  unverified: 0.40,
};

/** Get source quality score for an evidence item */
export function getSourceQuality(item: EvidenceItem): number {
  const sourceType = item.provenance.sourceType;
  return DEFAULT_SOURCE_QUALITY[sourceType] ?? 0.5;
}

/** Get source quality with optional override config */
export function getSourceQualityWithConfig(
  item: EvidenceItem,
  config?: Partial<Record<EvidenceSourceType, number>>
): number {
  const sourceType = item.provenance.sourceType;
  if (config && config[sourceType] !== undefined) {
    return config[sourceType]!;
  }
  return DEFAULT_SOURCE_QUALITY[sourceType] ?? 0.5;
}

/** Get source quality tier label */
export function getSourceQualityTier(item: EvidenceItem): string {
  const quality = getSourceQuality(item);
  if (quality >= 0.95) return "authoritative";
  if (quality >= 0.85) return "high";
  if (quality >= 0.7) return "medium";
  if (quality >= 0.5) return "low";
  return "unverified";
}

/** Get all source quality weights */
export function getAllSourceQualities(): Record<EvidenceSourceType, number> {
  return { ...DEFAULT_SOURCE_QUALITY };
}