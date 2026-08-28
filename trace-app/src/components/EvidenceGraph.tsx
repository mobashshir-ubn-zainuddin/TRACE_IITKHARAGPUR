"use client";
import { useEffect, useState } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node } from "@xyflow/react";
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

export function EvidenceGraph() {
  const [metric, setMetric] = useState<string>("revenue");
  const [period, setPeriod] = useState<string>("2024-08");
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
        const result: EvidenceGraphResponse = await res.json();
        const graphData = result.graphData;
        
        if (!graphData || !graphData.nodes || !graphData.edges) {
          throw new Error("Invalid graph data received from API");
        }
        
        const n: Node<{ label: string; type: string }>[] = graphData.nodes.map((node, i) => ({
          id: node.id,
          type: node.type,
          data: { label: node.label, type: node.type },
          position: { x: node.properties?.x as number || i * 150, y: node.properties?.y as number || 0 },
          style: { width: 140, padding: 8, background: "#4f46e5", color: "white", borderRadius: 4, border: "1px solid #3730a3" },
        }));
        
        const e: Edge[] = graphData.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          animated: true,
          style: { stroke: edge.type === "contradicts" ? "#ef4444" : "#22c55e", strokeWidth: 2 },
          label: edge.type,
          labelStyle: { fontSize: 10, fill: "#fff" },
          labelBgStyle: { fill: edge.type === "contradicts" ? "#ef4444" : "#22c55e", padding: 2, borderRadius: 2 },
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
      {loading ? (
        <p className="text-gray-600 dark:text-gray-300">Loading evidence…</p>
      ) : (
        <div style={{ width: "100%", height: 500 }} className="bg-white dark:bg-zinc-800 rounded">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
