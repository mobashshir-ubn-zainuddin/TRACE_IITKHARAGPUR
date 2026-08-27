/**
 * Module 4: Provenance Tracking
 * 
 * Every EvidenceItem must preserve full provenance:
 * - source, sourceType
 * - documentId/chunkId if applicable
 * - period, region, product
 * - retrieval method
 * - embedding model if applicable
 * - content hash
 * - score components
 * 
 * No evidence may exist without traceable provenance.
 */

import { createHash } from "crypto";
import type { EvidenceItem, EvidenceHypothesis, EvidencePackage, Provenance } from "./types";
export type { Provenance } from "./types";

/** Verify that an evidence item has complete provenance */
export function validateProvenance(item: EvidenceItem): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  const prov = item.provenance;
  
  if (!prov.source) missing.push("source");
  if (!prov.sourceType) missing.push("sourceType");
  if (!prov.retrievalMethod) missing.push("retrievalMethod");
  if (!prov.contentHash) missing.push("contentHash");
  if (!prov.timestamp) missing.push("timestamp");
  
  // For structured evidence
  if (prov.retrievalMethod === "structured") {
    if (!prov.metric) missing.push("metric (structured)");
    if (!prov.period) missing.push("period (structured)");
  }
  
  // For vector evidence
  if (prov.retrievalMethod === "vector" || prov.retrievalMethod === "hybrid") {
    if (!prov.embeddingModel) missing.push("embeddingModel");
  }
  
  // For document-based evidence
  if (prov.sourceType !== "structured") {
    if (!prov.documentId) missing.push("documentId");
    if (!prov.chunkId) missing.push("chunkId");
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/** Enrich evidence item with provenance if missing */
export function enrichProvenance(item: EvidenceItem): EvidenceItem {
  const enriched = { ...item };
  const prov = enriched.provenance;
  
  // Generate content hash if missing
  if (!prov.contentHash) {
    prov.contentHash = generateContentHash(enriched.text);
  }
  
  // Add timestamp if missing
  if (!prov.timestamp) {
    prov.timestamp = new Date().toISOString();
  }
  
  // Default retrieval method
  if (!prov.retrievalMethod) {
    prov.retrievalMethod = "structured";
  }
  
  // Default source type
  if (!prov.sourceType) {
    prov.sourceType = "unverified";
  }
  
  return enriched;
}

/** Generate content hash for deduplication and integrity */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Create provenance for structured evidence */
export function createStructuredProvenance(params: {
  source: string;
  metric: string;
  period: string;
  region?: string;
  product?: string;
  channel?: string;
  table: string;
  query: string;
}): Provenance {
  return {
    source: params.source,
    sourceType: "structured",
    metric: params.metric,
    period: params.period,
    region: params.region,
    product: params.product,
    channel: params.channel,
    retrievalMethod: "structured",
    contentHash: generateContentHash(params.query),
    timestamp: new Date().toISOString(),
  };
}

/** Create provenance for document evidence */
export function createDocumentProvenance(params: {
  source: string;
  sourceType: Exclude<Provenance["sourceType"], "structured">;
  documentId: number;
  chunkId: number;
  region?: string;
  product?: string;
  channel?: string;
  dateStart?: string;
  dateEnd?: string;
  retrievalMethod: "keyword" | "vector" | "hybrid";
  embeddingModel?: string;
  text: string;
}): Provenance {
  return {
    source: params.source,
    sourceType: params.sourceType,
    documentId: params.documentId,
    chunkId: params.chunkId,
    region: params.region,
    product: params.product,
    channel: params.channel,
    dateStart: params.dateStart,
    dateEnd: params.dateEnd,
    retrievalMethod: params.retrievalMethod,
    embeddingModel: params.embeddingModel,
    contentHash: generateContentHash(params.text),
    timestamp: new Date().toISOString(),
  };
}

/** Extract all provenance from an evidence package */
export function extractAllProvenance(pkg: EvidencePackage): Provenance[] {
  const allProvenance: Provenance[] = [];
  
  // From evidence items
  for (const item of pkg.allEvidence) {
    allProvenance.push(item.provenance);
  }
  
  // From hypotheses (if they have provenance)
  for (const hyp of pkg.hypotheses) {
    // Could add hypothesis-level provenance here
  }
  
  // Deduplicate by content hash
  const seen = new Set<string>();
  return allProvenance.filter(p => {
    if (seen.has(p.contentHash)) return false;
    seen.add(p.contentHash);
    return true;
  });
}

/** Generate provenance summary for audit trail */
export function generateProvenanceSummary(pkg: EvidencePackage): {
  totalEvidenceItems: number;
  uniqueSources: number;
  sourceTypes: Record<string, number>;
  retrievalMethods: Record<string, number>;
  embeddingModels: Record<string, number>;
  dateRange: { earliest: string; latest: string } | null;
  regions: Record<string, number>;
  products: Record<string, number>;
} {
  const provenance = extractAllProvenance(pkg);
  
  const sourceTypes: Record<string, number> = {};
  const retrievalMethods: Record<string, number> = {};
  const embeddingModels: Record<string, number> = {};
  const regions: Record<string, number> = {};
  const products: Record<string, number> = {};
  let earliest: Date | null = null;
  let latest: Date | null = null;
  
  for (const p of provenance) {
    sourceTypes[p.sourceType] = (sourceTypes[p.sourceType] || 0) + 1;
    retrievalMethods[p.retrievalMethod] = (retrievalMethods[p.retrievalMethod] || 0) + 1;
    if (p.embeddingModel) {
      embeddingModels[p.embeddingModel] = (embeddingModels[p.embeddingModel] || 0) + 1;
    }
    if (p.region) {
      regions[p.region] = (regions[p.region] || 0) + 1;
    }
    if (p.product) {
      products[p.product] = (products[p.product] || 0) + 1;
    }
    
    const ts = new Date(p.timestamp);
    if (!earliest || ts < earliest) earliest = ts;
    if (!latest || ts > latest) latest = ts;
  }
  
  return {
    totalEvidenceItems: provenance.length,
    uniqueSources: new Set(provenance.map(p => p.source)).size,
    sourceTypes,
    retrievalMethods,
    embeddingModels,
    dateRange: earliest && latest ? { earliest: earliest.toISOString(), latest: latest.toISOString() } : null,
    regions,
    products,
  };
}

/** Verify evidence chain integrity */
export function verifyEvidenceChain(pkg: EvidencePackage): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check each evidence item
  for (const item of pkg.allEvidence) {
    const validation = validateProvenance(item);
    if (!validation.valid) {
      issues.push(`Evidence ${item.id}: missing provenance fields - ${validation.missing.join(", ")}`);
    }
    
    // Verify content hash matches
    const expectedHash = generateContentHash(item.text);
    if (item.provenance.contentHash !== expectedHash) {
      issues.push(`Evidence ${item.id}: content hash mismatch - possible tampering`);
    }
  }
  
  // Check hypothesis-evidence linkage
  for (const hyp of pkg.hypotheses) {
    const hypEvidence = pkg.allEvidence.filter(e => e.hypothesisId === hyp.hypothesisId);
    if (hypEvidence.length !== hyp.evidenceCount) {
      issues.push(`Hypothesis ${hyp.hypothesisId}: evidenceCount (${hyp.evidenceCount}) doesn't match linked evidence (${hypEvidence.length})`);
    }
    
    const supportingIds = new Set(hyp.supportingEvidenceIds);
    const contradictingIds = new Set(hyp.contradictoryEvidenceIds);
    const neutralIds = new Set(hyp.neutralEvidenceIds);
    
    for (const e of hypEvidence) {
      if (!supportingIds.has(e.id) && !contradictingIds.has(e.id) && !neutralIds.has(e.id)) {
        issues.push(`Hypothesis ${hyp.hypothesisId}: evidence item ${e.id} not categorized in supporting/contradicting/neutral`);
      }
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}