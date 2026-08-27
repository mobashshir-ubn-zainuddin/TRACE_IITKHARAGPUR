/**
 * Module 4: Semantic Relevance Scoring
 * 
 * Scores how semantically relevant an evidence item is to the query/hypothesis.
 */

import type { EvidenceItem, EvidenceRequest } from "../types";

export interface SemanticRelevanceFeatures {
  /** Raw similarity score from vector search [0,1] */
  vectorSimilarity: number;
  /** Raw keyword match score [0,1] */
  keywordScore: number;
  /** Whether item was found by both methods */
  hybridMatch: boolean;
  /** Query terms coverage in evidence text [0,1] */
  termCoverage: number;
}

/** Calculate semantic relevance score */
export function calculateSemanticRelevance(
  item: EvidenceItem,
  request: EvidenceRequest
): number {
  // If we have vector similarity, use it as primary signal
  if (item.provenance.retrievalMethod === "vector" || item.provenance.retrievalMethod === "hybrid") {
    return item.semanticRelevance;
  }
  
  // For keyword-only, use normalized keyword score
  if (item.provenance.retrievalMethod === "keyword") {
    return Math.min(item.semanticRelevance, 1.0);
  }
  
  // Structured evidence - relevance based on metric alignment
  if (item.provenance.retrievalMethod === "structured") {
    return calculateStructuredRelevance(item, request);
  }
  
  return 0.5; // Default
}

/** Calculate relevance for structured evidence */
function calculateStructuredRelevance(item: EvidenceItem, request: EvidenceRequest): number {
  // Structured evidence is highly relevant if it matches the metric/driver
  let score = 0.8; // Base high relevance for structured data
  
  // Boost if metric matches
  if (item.provenance.metric === request.metric) {
    score += 0.1;
  }
  
  // Boost if period matches
  if (item.provenance.period === request.period) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}

/** Calculate term coverage for keyword evidence */
export function calculateTermCoverage(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (queryTerms.length === 0) return 0;
  
  const textLower = text.toLowerCase();
  let matches = 0;
  
  for (const term of queryTerms) {
    if (textLower.includes(term)) matches++;
  }
  
  return matches / queryTerms.length;
}