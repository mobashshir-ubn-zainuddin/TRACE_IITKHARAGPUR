"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, RefreshCw, GitBranch } from "lucide-react";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength?: number;
  properties: Record<string, unknown>;
}

interface EvidenceGraphData {
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

interface EvidenceGraphResponse {
  evidencePackage: unknown;
  graphData: EvidenceGraphData;
  telemetry: unknown;
  confidenceUpdates: unknown;
  provenanceSummary: unknown;
}

// Valid React Flow node types mapping
const VALID_NODE_TYPES = ["hypothesis", "evidence", "source", "kpi", "default"] as const;
type ValidNodeType = typeof VALID_NODE_TYPES[number];

// Valid React Flow edge types mapping
const VALID_EDGE_TYPES = ["supports", "contradicts", "neutral", "from_source", "about_driver", "about_kpi", "default"] as const;
type ValidEdgeType = typeof VALID_EDGE_TYPES[number];

function mapNodeType(type: string): ValidNodeType {
  return VALID_NODE_TYPES.includes(type as ValidNodeType) ? type as ValidNodeType : "default";
}

function mapEdgeType(type: string): ValidEdgeType {
  return VALID_EDGE_TYPES.includes(type as ValidEdgeType) ? type as ValidEdgeType : "default";
}

// Default period: current month in YYYY-MM format
function getDefaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Every node in this graph can appear as an edge source and/or target (KPI ->
 * hypothesis -> evidence -> source), and the API never sets sourceHandle /
 * targetHandle on edges (verified in src/server/evidence/graph.ts). So every
 * custom node gets the same pair of *default* (unnamed) handles - that's
 * what React Flow error "008" was: edges resolving to a source/target handle
 * that didn't exist on the node at all, because these were plain <div>s with
 * no <Handle> rendered.
 */
function GraphNodeCard({
  label,
  sublabel,
  background,
  border,
  textColor,
}: {
  label: string;
  sublabel: string;
  background: string;
  border: string;
  textColor: string;
}) {
  return (
    <div style={{ padding: 8, background, border: `1px solid ${border}`, borderRadius: 4, minWidth: 140, maxWidth: 220 }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, fontSize: 12, wordBreak: "break-word" }}>{label}</div>
      <div style={{ fontSize: 10, color: textColor }}>{sublabel}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  hypothesis: ({ data }) => (
    <GraphNodeCard label={data.label} sublabel="Hypothesis" background="#fef3c7" border="#f59e0b" textColor="#92400e" />
  ),
  evidence: ({ data }) => (
    <GraphNodeCard label={data.label} sublabel="Evidence" background="#dbeafe" border="#3b82f6" textColor="#1e40af" />
  ),
  source: ({ data }) => (
    <GraphNodeCard label={data.label} sublabel="Source" background="#dcfce7" border="#22c55e" textColor="#166534" />
  ),
  kpi: ({ data }) => (
    <GraphNodeCard label={data.label} sublabel="KPI" background="#fce7f3" border="#ec4899" textColor="#be185d" />
  ),
  default: ({ data }) => (
    <GraphNodeCard label={data.label} sublabel={data.type} background="#f3f4f6" border="#d1d5db" textColor="#6b7280" />
  ),
};

/**
 * Proper custom edges: a valid path is generated from React Flow's own
 * sourceX/sourceY/targetX/targetY via getBezierPath, then drawn through
 * BaseEdge (the raw <path> with no `d` in the previous implementation never
 * had geometry at all). Color/dash/label per edge type preserves the
 * supports / contradicts / neutral / from_source / about_driver / about_kpi
 * semantics - this is deliberately not collapsed into one generic edge.
 */
function makeSemanticEdge(color: string, dashed: boolean, label?: string) {
  return function SemanticEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
  }: EdgeProps) {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{ stroke: color, strokeWidth: 2, strokeDasharray: dashed ? "5,5" : undefined }}
        />
        {label && (
          <text x={labelX} y={labelY} fill={color} fontSize={10} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>
            {label}
          </text>
        )}
      </>
    );
  };
}

const edgeTypes: EdgeTypes = {
  supports: makeSemanticEdge("#22c55e", true, "Supports"),
  contradicts: makeSemanticEdge("#ef4444", true, "Contradicts"),
  neutral: makeSemanticEdge("#9ca3af", true),
  from_source: makeSemanticEdge("#3b82f6", false),
  about_driver: makeSemanticEdge("#f59e0b", true),
  about_kpi: makeSemanticEdge("#8b5cf6", true),
  default: makeSemanticEdge("#9ca3af", false),
};

export function EvidenceGraph({ 
  analysisId, 
  initialMetric = "revenue", 
  initialPeriod = getDefaultPeriod() 
}: { 
  analysisId?: string; 
  initialMetric?: string; 
  initialPeriod?: string; 
}) {
  const [metric, setMetric] = useState<string>(initialMetric);
  const [period, setPeriod] = useState<string>(initialPeriod);
  const [nodes, setNodes] = useState<Node<{ label: string; type: string }>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<EvidenceGraphData | null>(null);

  const buildApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("metric", metric);
    params.set("period", period);
    if (analysisId) params.set("analysisId", analysisId);
    return `/api/evidence?${params.toString()}`;
  }, [metric, period, analysisId]);

  useEffect(() => {
    let mounted = true;
    
    async function fetchEvidenceGraph() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildApiUrl);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
        }
        const result = await res.json();
        const data = result.graphData;
        
        if (!data || !data.nodes || !data.edges) {
          throw new Error("Invalid graph data received from API");
        }
        
        if (!mounted) return;
        
        setGraphData(data);

        // Validate before handing anything to ReactFlow: every node needs a
        // unique id/type/data/position, and every edge must reference nodes
        // that actually exist. An edge to a missing node is skipped (with a
        // dev warning) rather than fed to ReactFlow, which is the other way
        // "008"-style errors happen - not just missing handles.
        const seenNodeIds = new Set<string>();
        const validNodes: GraphNode[] = [];
        for (const node of data.nodes as GraphNode[]) {
          if (!node?.id || seenNodeIds.has(node.id)) {
            if (node?.id) console.warn(`Skipping duplicate evidence node id: ${node.id}`);
            continue;
          }
          seenNodeIds.add(node.id);
          validNodes.push(node);
        }

        // Tiered layout by node role (KPI -> Hypothesis -> Evidence ->
        // Source) instead of one flat row - the API never sets x/y, so this
        // is what actually makes the DAG readable.
        const tierOf = (type: string): number =>
          type === "kpi" ? 0 : type === "hypothesis" ? 1 : type === "evidence" ? 2 : type === "source" ? 3 : 4;
        const tierCounts = [0, 0, 0, 0, 0];

        const n: Node<{ label: string; type: string }>[] = validNodes.map((node) => {
          const tier = tierOf(node.type);
          const col = tierCounts[tier]++;
          const x = (node.properties?.x as number) ?? tier * 260;
          const y = (node.properties?.y as number) ?? col * 90;
          return {
            id: node.id,
            type: mapNodeType(node.type),
            data: { label: node.label, type: node.type },
            position: { x, y },
          };
        });

        const e: Edge[] = [];
        for (const edge of data.edges as GraphEdge[]) {
          if (!edge?.id || !edge.source || !edge.target) continue;
          if (!seenNodeIds.has(edge.source) || !seenNodeIds.has(edge.target)) {
            console.warn(`Skipping invalid evidence edge: source node ${edge.source} / target node ${edge.target} (edge ${edge.id})`);
            continue;
          }
          e.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: mapEdgeType(edge.type),
            animated: edge.type === "supports" || edge.type === "contradicts",
          });
        }

        setNodes(n);
        setEdges(e);
      } catch (err) {
        if (!mounted) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load evidence graph");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchEvidenceGraph();
    
    return () => { mounted = false; };
  }, [buildApiUrl]);

  const emptyState = useMemo(() => (
    <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded flex flex-col items-center justify-center">
      <div className="text-center p-8">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-300 text-lg">No evidence graph available</p>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          {analysisId
            ? "No evidence data found for this analysis. Run an analysis first."
            : "Select a metric and period, or run an analysis to generate evidence graph."}
        </p>
      </div>
    </div>
  ), [analysisId]);

  // Distinct from the "no data returned at all" state above: the API
  // responded and graphData exists, but after validation there is nothing
  // renderable (e.g. every edge referenced a missing node, or the package
  // genuinely has zero hypotheses/evidence). Never hand ReactFlow an empty
  // graph silently - say so.
  const noRelationshipsState = (
    <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded flex flex-col items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-300 text-lg">No evidence relationships available</p>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
          Evidence relationships will appear when the analysis contains traceable supporting or contradicting evidence.
        </p>
      </div>
    </div>
  );

  return (
    <section className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-black dark:text-white">Evidence Graph</h1>
        <div className="flex items-center gap-2">
          {loading && (
            <RefreshCw className="w-5 h-5 text-primary animate-spin" />
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="text-gray-800 dark:text-gray-200 font-medium">Metric:</label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100 border border-gray-300 dark:border-zinc-600"
          disabled={loading}
        >
          <option value="revenue">Revenue</option>
          <option value="orders">Orders</option>
          <option value="aov">AOV</option>
          <option value="conversion">Conversion</option>
          <option value="marketingROI">Marketing ROI</option>
        </select>
        <label className="text-gray-800 dark:text-gray-200 font-medium">Period:</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100 border border-gray-300 dark:border-zinc-600"
          disabled={loading}
        />
        {analysisId && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded">
            Analysis: {analysisId}
          </span>
        )}
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-700 dark:text-red-300 font-medium">Error loading evidence graph</p>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
            <p className="text-red-500 dark:text-red-500 text-xs mt-2">
              The graph requires vector search which may be unavailable. 
              Structured and keyword evidence may still be accessible via the investigation page.
            </p>
          </div>
        </div>
      )}
      
      {loading ? (
        <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-10 h-10 text-primary animate-spin mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-300">Loading evidence graph…</p>
          </div>
        </div>
      ) : !graphData ? (
        emptyState
      ) : nodes.length === 0 ? (
        noRelationshipsState
      ) : (
        <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onError={(id, message) => console.error(`[React Flow ${id}] ${message}`)}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
