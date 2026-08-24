"use client";
import { useEffect, useState } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type EvidenceNode = {
  id: string;
  label: string;
};

export function EvidenceGraph() {
  const [metric, setMetric] = useState<string>("revenue");
  const [month, setMonth] = useState<string>("2024-08");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchEvidence() {
      setLoading(true);
      try {
        const res = await fetch(`/api/evidence?kpi=${metric}&month=${month}`);
        const data = await res.json();
        const n: Node[] = data.map((e: any, i: number) => ({
          id: e.id.toString(),
          data: { label: e.topic },
          position: { x: i * 150, y: 0 },
          style: { width: 120, padding: 8, background: "#4f46e5", color: "white", borderRadius: 4 },
        }));
        const e: Edge[] = [];
        for (let i = 0; i < n.length - 1; i++) {
          e.push({ id: `e${i}`, source: n[i].id, target: n[i + 1].id, animated: true, style: { stroke: "#fff" } });
        }
        setNodes(n);
        setEdges(e);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvidence();
  }, [metric, month]);

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
        <label className="text-gray-800 dark:text-gray-200">Month:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
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
