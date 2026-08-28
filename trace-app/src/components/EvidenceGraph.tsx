"use client";
import { useEffect, useState } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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

export function EvidenceGraph() {
  const [metric, setMetric] = useState<string>("revenue");
  const [period, setPeriod] = useState<string>("2026-08");
  const [nodes, setNodes] = useState<Node<{ label: string; type: string }>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvidenceGraph() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/evidence?metric=${metric}&period=${period}`);
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        const result = await res.json();
        const graphData = result.graphData;
        
        if (!graphData || !graphData.nodes || !graphData.edges) {
          throw new Error("Invalid graph data received from API");
        }
        
        const n = graphData.nodes.map((node: GraphNode, i: number) => ({
          id: node.id,
          type: node.type || "default",
          data: { label: node.label, type: node.type },
          position: { x: node.properties?.x as number || i * 150, y: node.properties?.y as number || 0 },
          style: { width: 140, padding: 8, background: "#4f46e5", color: "white", borderRadius: 4, border: "1px solid #3730a3" },
        }));
        
        const e = graphData.edges.map((edge: GraphEdge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || "default",
          animated: true,
          style: { stroke: edge.type === "contradicts" ? "#ef4444" : edge.type === "supports" ? "#22c55e" : "#9ca3af", strokeWidth: 2 },
          label: edge.type,
          labelStyle: { fontSize: 10, fill: "#fff" },
          labelBgStyle: { fill: edge.type === "contradicts" ? "#ef4444" : edge.type === "supports" ? "#22c55e" : "#9ca3af", padding: 2, borderRadius: 2 },
        }));
        
        setNodes(n);
        setEdges(e);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load evidence graph");
      } finally {
        setLoading(false);
      }
    }
    fetchEvidenceGraph();
  }, [metric, period]);

  return (
    <section className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <h1 className="text-2xl font-bold mb-4 text-black dark:text-white">Evidence Graph</h1>
      <div className="flex items-center gap-4 mb-4">
        <label className="text-gray-800 dark:text-gray-200">Metric:</label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100"
        >
          <option value="revenue">Revenue</option>
          <option value="orders">Orders</option>
          <option value="aov">AOV</option>
        </select>
        <label className="text-gray-800 dark:text-gray-200">Period:</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100"
        />
      </div>
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300 font-medium">Error loading evidence graph:</p>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
          <p className="text-red-500 dark:text-red-500 text-xs mt-2">Falling back to structured/keyword evidence only.</p>
        </div>
      )}
      {loading ? (
        <p className="text-gray-600 dark:text-gray-300">Loading evidence…</p>
      ) : (
        <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
