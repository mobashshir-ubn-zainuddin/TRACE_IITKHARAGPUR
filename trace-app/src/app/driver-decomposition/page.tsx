// src/app/driver-decomposition/page.tsx
"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type RegionData = {
  region: string;
  value: number;
};

export default function DriverDecomposition() {
  const [month, setMonth] = useState<string>("2024-08"); // default to latest month
  const [data, setData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/kpi?metric=revenue&month=${month}`);
        const json = await res.json();
        // For demo, we split revenue by region using static mock percentages
        const regions = ["North", "South", "East", "West"];
        const perRegion = json.value / regions.length;
        setData(regions.map((r) => ({ region: r, value: Math.round(perRegion) })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [month]);

  return (
    <section className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <h1 className="text-2xl font-bold mb-4 text-black dark:text-white">Driver Decomposition – Revenue by Region</h1>
      <div className="flex items-center gap-4 mb-4">
        <label className="text-gray-800 dark:text-gray-200">Month:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100"
        />
      </div>
      {loading ? (
        <p className="text-gray-600 dark:text-gray-300">Loading…</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
            <XAxis dataKey="region" stroke="rgba(0,0,0,0.7)" />
            <YAxis stroke="rgba(0,0,0,0.7)" />
            <Tooltip />
            <Bar dataKey="value" fill="#34d399" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
