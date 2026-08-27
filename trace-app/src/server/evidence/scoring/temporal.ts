/**
 * Module 4: Temporal Relevance Scoring
 * 
 * Scores how temporally relevant evidence is to the hypothesis period.
 * Same period = high, adjacent period = medium/high, distant = lower.
 * Historical evidence must not be automatically discarded.
 */

import type { EvidenceItem, EvidenceRequest } from "../types";

/** Calculate temporal relevance score */
export function calculateTemporalRelevance(
  item: EvidenceItem,
  request: EvidenceRequest
): number {
  const hypothesisPeriod = request.period; // e.g., "2026-08"
  if (!hypothesisPeriod) return 0.5;
  
  // Parse hypothesis period
  const [hYear, hMonth] = hypothesisPeriod.split("-").map(Number);
  const hypothesisDate = new Date(hYear, hMonth - 1, 15); // Mid-month
  
  // Get evidence date range
  const startDate = item.provenance.dateStart ? new Date(item.provenance.dateStart) : null;
  const endDate = item.provenance.dateEnd ? new Date(item.provenance.dateEnd) : null;
  const docDate = item.provenance.documentDate ? new Date(item.provenance.documentDate) : null;
  
  // Use the most relevant date
  const evidenceDate = startDate || endDate || docDate;
  if (!evidenceDate) return 0.5;
  
  // Calculate month difference
  const diffMonths = Math.abs(
    (hypothesisDate.getFullYear() - evidenceDate.getFullYear()) * 12 +
    (hypothesisDate.getMonth() - evidenceDate.getMonth())
  );
  
  // Scoring:
  // Same month = 1.0
  // Adjacent month = 0.9
  // Within quarter (1-3 months) = 0.8
  // Within half-year (4-6 months) = 0.6
  // Within year (7-12 months) = 0.4
  // 1-2 years = 0.25
  // 2+ years = 0.15 (but not zero - historical context matters)
  
  if (diffMonths === 0) return 1.0;
  if (diffMonths === 1) return 0.9;
  if (diffMonths <= 3) return 0.8;
  if (diffMonths <= 6) return 0.6;
  if (diffMonths <= 12) return 0.4;
  if (diffMonths <= 24) return 0.25;
  return 0.15;
}

/** Calculate temporal relevance for a date range overlap */
export function calculateTemporalOverlap(
  item: EvidenceItem,
  request: EvidenceRequest
): number {
  const hypothesisPeriod = request.period;
  if (!hypothesisPeriod) return 0.5;
  
  const [hYear, hMonth] = hypothesisPeriod.split("-").map(Number);
  const periodStart = new Date(hYear, hMonth - 1, 1);
  const periodEnd = new Date(hYear, hMonth, 0); // Last day of month
  
  const evStart = item.provenance.dateStart ? new Date(item.provenance.dateStart) : null;
  const evEnd = item.provenance.dateEnd ? new Date(item.provenance.dateEnd) : null;
  
  if (!evStart || !evEnd) {
    // Fall back to single date relevance
    return calculateTemporalRelevance(item, request);
  }
  
  // Calculate overlap
  const overlapStart = evStart > periodStart ? evStart : periodStart;
  const overlapEnd = evEnd < periodEnd ? evEnd : periodEnd;
  
  if (overlapStart > overlapEnd) return 0; // No overlap
  
  const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
  const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
  
  // Overlap ratio
  return Math.min(overlapDays / periodDays, 1.0);
}

/** Get temporal relevance tier label */
export function getTemporalTier(item: EvidenceItem, request: EvidenceRequest): string {
  const score = calculateTemporalRelevance(item, request);
  if (score >= 0.9) return "same_period";
  if (score >= 0.8) return "adjacent_period";
  if (score >= 0.6) return "same_quarter";
  if (score >= 0.4) return "same_half_year";
  if (score >= 0.25) return "same_year";
  return "historical";
}