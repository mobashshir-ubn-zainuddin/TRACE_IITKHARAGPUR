/**
 * Module 4: Entity Relevance Scoring
 * 
 * Scores how well evidence matches the hypothesis entities (region, product, channel).
 * Exact match = high, partial match = medium, unrelated = low.
 */

import type { EvidenceItem, EvidenceRequest } from "../types";

/** Calculate entity relevance score */
export function calculateEntityRelevance(
  item: EvidenceItem,
  request: EvidenceRequest
): number {
  const filters = request.filters;
  let matches = 0;
  let total = 0;
  let weights = 0;
  let weightedMatches = 0;
  
  // Region match (highest weight)
  if (filters.region) {
    total++;
    weights += 0.5;
    if (item.provenance.region === filters.region) {
      matches++;
      weightedMatches += 0.5;
    } else if (!item.provenance.region) {
      // Unknown region - partial credit
      matches += 0.3;
      weightedMatches += 0.15;
    }
  }
  
  // Product match (medium weight)
  if (filters.product) {
    total++;
    weights += 0.3;
    if (item.provenance.product === filters.product) {
      matches++;
      weightedMatches += 0.3;
    } else if (!item.provenance.product) {
      matches += 0.3;
      weightedMatches += 0.09;
    }
  }
  
  // No channel in EvidenceRequest.filters - skip channel match
  // Channel match would be here if filters had channel property
  
  // Calculate score
  if (total === 0) return 1.0; // No filters = perfect match
  return Math.min(1, weightedMatches / weights);
}

/** Calculate entity match details for debugging */
export function getEntityMatchDetails(
  item: EvidenceItem,
  request: EvidenceRequest
): {
  region: { match: boolean; weight: number; evidenceRegion?: string };
  product: { match: boolean; weight: number; evidenceProduct?: string };
  channel: { match: boolean; weight: number; evidenceChannel?: string };
  overall: number;
} {
  const filters = request.filters;
  const details = {
    region: { match: false, weight: 0, evidenceRegion: item.provenance.region },
    product: { match: false, weight: 0, evidenceProduct: item.provenance.product },
    channel: { match: false, weight: 0, evidenceChannel: item.provenance.channel },
    overall: 0,
  };
  
  let totalWeight = 0;
  let matchedWeight = 0;
  
  if (filters.region) {
    details.region.match = item.provenance.region === filters.region;
    details.region.weight = 0.5;
    totalWeight += 0.5;
    if (details.region.match) matchedWeight += 0.5;
    else if (!item.provenance.region) matchedWeight += 0.15;
  }
  
  if (filters.product) {
    details.product.match = item.provenance.product === filters.product;
    details.product.weight = 0.3;
    totalWeight += 0.3;
    if (details.product.match) matchedWeight += 0.3;
    else if (!item.provenance.product) matchedWeight += 0.09;
  }
  
  // No channel in EvidenceRequest.filters - skip channel match
  // Channel match would be here if filters had channel property
  
  details.overall = totalWeight > 0 ? matchedWeight / totalWeight : 0.5;
  
  return details;
}