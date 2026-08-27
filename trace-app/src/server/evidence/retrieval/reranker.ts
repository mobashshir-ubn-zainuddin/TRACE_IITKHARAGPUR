/**
 * Module 4: Reranker
 * 
 * Reranks merged evidence candidates using cross-encoder style scoring
 * or lightweight feature-based reranking.
 */

import type { EvidenceItem, EvidenceRequest } from "../types";

export interface RerankOptions {
  evidenceRequest: EvidenceRequest;
  expectedDirection: "positive" | "negative";
  topK?: number;
}

export async function rerank(
  evidence: EvidenceItem[],
  evidenceRequest: EvidenceRequest,
  expectedDirection: "positive" | "negative",
  options?: Partial<RerankOptions>
): Promise<EvidenceItem[]> {
  const { topK = 20 } = options || {};
  
  if (evidence.length <= 1) return evidence;
  
  // Calculate reranking features for each item
  const scored = evidence.map(item => {
    const features = calculateRerankFeatures(item, evidenceRequest, expectedDirection);
    const rerankScore = computeRerankScore(features);
    return { item, features, rerankScore };
  });
  
  // Sort by rerank score descending
  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  
  // Return top-K with updated evidenceScore
  return scored.slice(0, topK).map(s => ({
    ...s.item,
    evidenceScore: s.rerankScore,
  }));
}

/** Calculate features for reranking */
function calculateRerankFeatures(
  item: EvidenceItem,
  request: EvidenceRequest,
  expectedDirection: "positive" | "negative"
): {
  semanticRelevance: number;
  sourceQuality: number;
  temporalProximity: number;
  entityMatch: number;
  directionConsistency: number;
  authorityScore: number;
  recency: number;
} {
  // Temporal proximity: how close is the evidence date to the hypothesis period
  const temporalProximity = calculateTemporalProximity(
    item.provenance.dateStart,
    item.provenance.dateEnd,
    request.period
  );
  
  // Entity match: region/product/channel alignment
  const entityMatch = calculateEntityMatch(item, request);
  
  // Direction consistency: does the evidence direction match expected?
  const directionConsistency = item.direction === "support" ? 1.0 :
                              item.direction === "contradict" ? 0.0 : 0.5;
  
  // Authority score from source
  const authorityScore = item.provenance.sourceType === "structured" ? 1.0 :
                         item.provenance.sourceType === "internal_report" ? 0.9 :
                         item.provenance.sourceType === "operations_report" ? 0.9 :
                         item.provenance.sourceType === "support_ticket" ? 0.7 :
                         item.provenance.sourceType === "customer_review" ? 0.6 :
                         item.provenance.sourceType === "marketing_report" ? 0.75 :
                         item.provenance.sourceType === "pricing_report" ? 0.8 :
                         item.provenance.sourceType === "fulfillment_report" ? 0.8 :
                         item.provenance.sourceType === "inventory_report" ? 0.85 :
                         0.4;
  
  // Recency: more recent documents get slight boost
  const recency = calculateRecency(item.provenance.documentDate || item.provenance.dateStart);
  
  return {
    semanticRelevance: item.semanticRelevance,
    sourceQuality: item.sourceQuality,
    temporalProximity,
    entityMatch,
    directionConsistency,
    authorityScore,
    recency,
  };
}

/** Calculate temporal proximity score */
function calculateTemporalProximity(
  dateStart?: string,
  dateEnd?: string,
  hypothesisPeriod?: string
): number {
  if (!hypothesisPeriod) return 0.5;
  
  // Parse hypothesis period (e.g., "2026-08")
  const [hYear, hMonth] = hypothesisPeriod.split("-").map(Number);
  const hypothesisDate = new Date(hYear, hMonth - 1, 15); // Mid-month
  
  // Use dateStart or dateEnd
  const evidenceDateStr = dateStart || dateEnd;
  if (!evidenceDateStr) return 0.5;
  
  const evidenceDate = new Date(evidenceDateStr);
  const diffMonths = Math.abs(
    (hypothesisDate.getFullYear() - evidenceDate.getFullYear()) * 12 +
    (hypothesisDate.getMonth() - evidenceDate.getMonth())
  );
  
  // Same month = 1.0, adjacent = 0.8, within quarter = 0.6, within year = 0.4, older = 0.2
  if (diffMonths === 0) return 1.0;
  if (diffMonths === 1) return 0.8;
  if (diffMonths <= 3) return 0.6;
  if (diffMonths <= 6) return 0.6;
  if (diffMonths <= 12) return 0.4;
  if (diffMonths <= 24) return 0.25;
  return 0.15;
}

/** Calculate entity match score */
function calculateEntityMatch(item: EvidenceItem, request: EvidenceRequest): number {
  let matches = 0;
  let total = 0;
  
  // Region match
  if (request.filters.region) {
    total++;
    if (item.provenance.region === request.filters.region) matches++;
    else if (!item.provenance.region) matches += 0.5; // Unknown region = partial
  }
  
  // Product match
  if (request.filters.product) {
    total++;
    if (item.provenance.product === request.filters.product) matches++;
    else if (!item.provenance.product) matches += 0.5;
  }
  
  // No channel in EvidenceRequest.filters - skip channel match
  // Channel match would be here if filters had channel property
  
  return total > 0 ? matches / total : 0.5;
}

/** Calculate recency score */
function calculateRecency(dateStr?: string): number {
  if (!dateStr) return 0.5;
  
  const docDate = new Date(dateStr);
  const now = new Date();
  const diffMonths = (now.getFullYear() - docDate.getFullYear()) * 12 + 
                     (now.getMonth() - docDate.getMonth());
  
  // Within 3 months = 1.0, within 6 = 0.8, within 12 = 0.6, older = 0.4
  if (diffMonths <= 3) return 1.0;
  if (diffMonths <= 6) return 0.8;
  if (diffMonths <= 12) return 0.6;
  return 0.4;
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Compute rerank score from features */
function computeRerankScore(features: {
  semanticRelevance: number;
  sourceQuality: number;
  temporalProximity: number;
  entityMatch: number;
  directionConsistency: number;
  authorityScore: number;
  recency: number;
}): number {
  // Weighted combination of features
  const weights = {
    semanticRelevance: 0.30,
    sourceQuality: 0.20,
    temporalProximity: 0.15,
    entityMatch: 0.15,
    directionConsistency: 0.10,
    authorityScore: 0.05,
    recency: 0.05,
  };
  
  return (
    weights.semanticRelevance * features.semanticRelevance +
    weights.sourceQuality * features.sourceQuality +
    weights.temporalProximity * features.temporalProximity +
    weights.entityMatch * features.entityMatch +
    weights.directionConsistency * features.directionConsistency +
    weights.authorityScore * features.authorityScore +
    weights.recency * features.recency
  );
}

export { cosineSimilarity, computeRerankScore };