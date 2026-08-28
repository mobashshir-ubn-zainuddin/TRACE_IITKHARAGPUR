"use client";
import { useEffect, useState, useMemo } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, RefreshCw } from "lucide-react";

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

const nodeTypes: NodeTypes = {
  hypothesis: ({ data }) => (
    <div style={{ padding: 8, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: "#92400e" }}>Hypothesis</div>
    </div>
  ),
  evidence: ({ data }) => (
    <div style={{ padding: 8, background: "#dbeafe", border: "1px solid #3b82f6", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: "#1e40af" }}>Evidence</div>
    </div>
  ),
  source: ({ data }) => (
    <div style={{ padding: 8, background: "#dcfce7", border: "1px solid #22c55e", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: "#166534" }}>Source</div>
    </div>
  ),
  kpi: ({ data }) => (
    <div style={{ padding: 8, background: "#fce7f3", border: "1px solid #ec4899", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: "#be185d" }}>KPI</div>
    </div>
  ),
  default: ({ data }) => (
    <div style={{ padding: 8, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.label}</div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{data.type}</div>
    </div>
  ),
};

const edgeTypes: EdgeTypes = {
  supports: ({ data }) => (
    <>
      <path stroke="#22c55e" strokeWidth={2} strokeDasharray="5,5" />
      {data?.strength && <text fill="#166534" fontSize={10} textAnchor="middle" dominantBaseline="middle">Supports</text>}
    </>
  ),
  contradicts: ({ data }) => (
    <>
      <path stroke="#ef4444" strokeWidth={2} strokeDasharray="5,5" />
      {data?.strength && <text fill="#991b1b" fontSize={10} textAnchor="middle" dominantBaseline="middle">Contradicts</text>}
    </>
  ),
  neutral: ({ data }) => (
    <path stroke="#9ca3af" strokeWidth={2} strokeDasharray="5,5" />
  ),
  from_source: ({ data }) => (
    <path stroke="#3b82f6" strokeWidth={2} />
  ),
  about_driver: ({ data }) => (
    <path stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,5" />
  ),
  about_kpi: ({ data }) => (
    <path stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5,5" />
  ),
  default: ({ data }) => (
    <path stroke="#9ca3af" strokeWidth={2} />
  ),
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
        
        const n = data.nodes.map((node: GraphNode, i: number) => ({
          id: node.id,
          type: mapNodeType(node.type),
          data: { label: node.label, type: node.type },
          position: { 
            x: (node.properties?.x as number) ?? i * 150, 
            y: (node.properties?.y as number) ?? 0 
          },
          style: { width: 140, padding: 8, background: "#4f46e5", color: "white", borderRadius: 4, border: "1px solid #3730a3" },
        }));
        
        const e = data.edges.map((edge: GraphEdge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: mapEdgeType(edge.type),
          animated: true,
          style: { 
            stroke: edge.type === "contradicts" ? "#ef4444" : edge.type === "supports" ? "#22c55e" : "#9ca3af", 
            strokeWidth: 2 
          },
          label: edge.type,
          labelStyle: { fontSize: 10, fill: "#fff" },
          labelBgStyle: { 
            fill: edge.type === "contradicts" ? "#ef4444" : edge.type === "supports" ? "#22c55e" : "#9ca3af", 
            padding: 2, 
            borderRadius: 2 
          },
        }));
        
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
      ) : graphData ? (
        <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onError={(err) => console.error("React Flow error:", err)}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      ) : (
        emptyState
      )}
    </section>
  );
}
