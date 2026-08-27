/**
 * Module 4: Evidence Graph Generation
 * 
 * Generates graph-ready data for visualization:
 * 
 * Hypothesis
 *   ↓
 * Evidence
 *   ↓
 * SUPPORT / CONTRADICT / NEUTRAL
 *   ↓
 * Source
 * 
 * Represents relationships such as:
 * 
 * HYPOTHESIS --SUPPORTED_BY--> EVIDENCE
 * HYPOTHESIS --CONTRADICTED_BY--> EVIDENCE
 * EVIDENCE --FROM_SOURCE--> SOURCE
 * 
 * Returns graph data as structured JSON.
 */

import type { EvidencePackage, EvidenceHypothesis, EvidenceItem, Provenance } from "./types";

export interface GraphNode {
  id: string;
  type: "hypothesis" | "evidence" | "source" | "driver" | "kpi";
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "supports" | "contradicts" | "neutral" | "from_source" | "about_driver" | "about_kpi";
  strength?: number;
  properties: Record<string, unknown>;
}

export interface EvidenceGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    hypothesisCount: number;
    evidenceCount: number;
    sourceCount: number;
    generatedAt: string;
    analysisId: string;
  };
}

/** Generate graph data from evidence package */
export function generateEvidenceGraph(pkg: EvidencePackage): EvidenceGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const sourceNodes = new Map<string, GraphNode>();
  
  // Add KPI node
  const kpiNode = createKpiNode(pkg.metric, pkg.period);
  nodes.push(kpiNode);
  nodeIds.add(kpiNode.id);
  
  // Add hypothesis nodes
  for (const hyp of pkg.hypotheses) {
    const hypNode = createHypothesisNode(hyp);
    nodes.push(hypNode);
    nodeIds.add(hypNode.id);
    
    // Edge from KPI to hypothesis
    edges.push({
      id: `edge-kpi-${hyp.hypothesisId}`,
      source: kpiNode.id,
      target: hypNode.id,
      type: "about_kpi",
      properties: { metric: pkg.metric, period: pkg.period },
    });
  }
  
  // Add evidence nodes and edges
  for (const item of pkg.allEvidence) {
    if (nodeIds.has(item.id)) continue;
    
    const evidenceNode = createEvidenceNode(item);
    nodes.push(evidenceNode);
    nodeIds.add(evidenceNode.id);
    
    // Edge from hypothesis to evidence
    const hypNode = nodes.find(n => n.id === `hypothesis-${item.hypothesisId}`);
    if (hypNode) {
      const edgeType = item.direction === "support" ? "supports" :
                       item.direction === "contradict" ? "contradicts" : "neutral";
      
      edges.push({
        id: `edge-${hypNode.id}-${item.id}`,
        source: hypNode.id,
        target: item.id,
        type: edgeType,
        strength: item.evidenceScore,
        properties: {
          semanticRelevance: item.semanticRelevance,
          sourceQuality: item.sourceQuality,
          temporalRelevance: item.temporalRelevance,
          entityRelevance: item.entityRelevance,
          hypothesisAlignment: item.hypothesisAlignment,
        },
      });
    }
    
    // Add source node and edge
    const sourceKey = `${item.provenance.sourceType}:${item.provenance.source}`;
    if (!sourceNodes.has(sourceKey)) {
      const sourceNode = createSourceNode(item.provenance);
      nodes.push(sourceNode);
      sourceNodes.set(sourceKey, sourceNode);
    }
    
    const sourceNode = sourceNodes.get(sourceKey)!;
    edges.push({
      id: `edge-${item.id}-${sourceNode.id}`,
      source: item.id,
      target: sourceNode.id,
      type: "from_source",
      properties: {
        retrievalMethod: item.provenance.retrievalMethod,
        embeddingModel: item.provenance.embeddingModel,
      },
    });
  }
  
  return {
    nodes,
    edges,
    metadata: {
      hypothesisCount: pkg.hypotheses.length,
      evidenceCount: pkg.allEvidence.length,
      sourceCount: sourceNodes.size,
      generatedAt: new Date().toISOString(),
      analysisId: pkg.analysisId,
    },
  };
}

/** Create KPI node */
function createKpiNode(metric: string, period: string): GraphNode {
  return {
    id: `kpi-${metric}-${period}`,
    type: "kpi",
    label: `${metric.toUpperCase()} (${period})`,
    properties: { metric, period },
  };
}

/** Create hypothesis node */
function createHypothesisNode(hyp: EvidenceHypothesis): GraphNode {
  return {
    id: `hypothesis-${hyp.hypothesisId}`,
    type: "hypothesis",
    label: `${hyp.id}: ${hyp.name}`,
    properties: {
      hypothesisId: hyp.hypothesisId,
      driver: hyp.driver,
      name: hyp.name,
      claim: hyp.claim,
      expectedDirection: hyp.expectedDirection,
      priorConfidence: hyp.priorConfidence,
      evidenceConfidence: hyp.evidenceConfidence,
      updatedConfidence: hyp.updatedConfidence,
      status: hyp.status,
      evidenceCount: hyp.evidenceCount,
      supportCount: hyp.supportingEvidenceIds.length,
      contradictCount: hyp.contradictoryEvidenceIds.length,
      neutralCount: hyp.neutralEvidenceIds.length,
    },
  };
}

/** Create evidence node */
function createEvidenceNode(item: EvidenceItem): GraphNode {
  return {
    id: item.id,
    type: "evidence",
    label: truncateText(item.text, 80),
    properties: {
      hypothesisId: item.hypothesisId,
      driver: item.driver,
      direction: item.direction,
      evidenceScore: item.evidenceScore,
      semanticRelevance: item.semanticRelevance,
      sourceQuality: item.sourceQuality,
      temporalRelevance: item.temporalRelevance,
      entityRelevance: item.entityRelevance,
      hypothesisAlignment: item.hypothesisAlignment,
      provenance: {
        source: item.provenance.source,
        sourceType: item.provenance.sourceType,
        region: item.provenance.region,
        product: item.provenance.product,
        channel: item.provenance.channel,
        period: item.provenance.period,
        retrievalMethod: item.provenance.retrievalMethod,
        embeddingModel: item.provenance.embeddingModel,
        documentId: item.provenance.documentId,
        chunkId: item.provenance.chunkId,
        contentHash: item.provenance.contentHash,
        timestamp: item.provenance.timestamp,
      },
    },
  };
}

/** Create source node */
function createSourceNode(prov: Provenance): GraphNode {
  const sourceId = `source-${prov.sourceType}-${prov.source.replace(/\s+/g, "-").toLowerCase()}`;
  
  return {
    id: sourceId,
    type: "source",
    label: `${prov.source} (${prov.sourceType})`,
    properties: {
      source: prov.source,
      sourceType: prov.sourceType,
      authorityScore: getSourceAuthority(prov.sourceType),
    },
  };
}

/** Get source authority score */
function getSourceAuthority(sourceType: Provenance["sourceType"]): number {
  const authorities: Record<string, number> = {
    structured: 1.00,
    internal_report: 0.90,
    operations_report: 0.90,
    inventory_report: 0.85,
    pricing_report: 0.80,
    fulfillment_report: 0.80,
    marketing_report: 0.75,
    support_ticket: 0.70,
    customer_review: 0.60,
    unverified: 0.40,
  };
  return authorities[sourceType] || 0.5;
}

/** Truncate text for display */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/** Export graph data as Cytoscape.js compatible format */
export function toCytoscapeFormat(graph: EvidenceGraphData) {
  return {
    elements: {
      nodes: graph.nodes.map(n => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          ...n.properties,
        },
        classes: n.type,
      })),
      edges: graph.edges.map(e => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          strength: e.strength,
          ...e.properties,
        },
        classes: e.type,
      })),
    },
  };
}

/** Export graph data as Graphology format */
export function toGraphologyFormat(graph: EvidenceGraphData) {
  const nodes = graph.nodes.map(n => ({
    key: n.id,
    attributes: {
      label: n.label,
      type: n.type,
      ...n.properties,
    },
  }));
  
  const edges = graph.edges.map(e => ({
    key: e.id,
    source: e.source,
    target: e.target,
    attributes: {
      type: e.type,
      strength: e.strength,
      ...e.properties,
    },
  }));
  
  return { nodes, edges };
}