"use client";
// src/app/dashboard/page.tsx
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

interface KPIData {
  month: string;
  value: number;
  is_anomaly: boolean;
  severity?: "low" | "medium" | "high";
}

interface KPIApiResponse {
  month: string;
  value: number;
  is_anomaly: boolean;
  severity?: "low" | "medium" | "high";
}

export default function Dashboard() {
  const [metric, setMetric] = useState<string>("revenue");
  const [data, setData] = useState<KPIData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchKPI() {
      setLoading(true);
      try {
        const months = Array.from({ length: 12 }, (_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (11 - i));
          return d.toISOString().slice(0, 7);
        });
        const promises = months.map((m) =>
          fetch(`/api/kpi?metric=${metric}&month=${m}`).then((r) => r.json())
        );
        const results = await Promise.all(promises);
        setData(
          results.map((r: KPIApiResponse) => ({
            month: r.month,
            value: r.value,
            is_anomaly: r.is_anomaly,
            severity: r.severity,
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchKPI();
  }, [metric]);

  return (
    <section className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <h1 className="text-3xl font-bold mb-4 text-black dark:text-white">
        Dashboard – KPI Storytelling
      </h1>
      <div className="flex items-center gap-4 mb-6">
        <label htmlFor="metric" className="text-lg text-black dark:text-gray-200">
          Metric:
        </label>
        <select
          id="metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="rounded-md p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100"
        >
          <option value="revenue">Revenue</option>
          <option value="orders">Orders</option>
          <option value="aov">Average Order Value</option>
        </select>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <Loader2 className="animate-spin" /> Loading KPI data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
            <XAxis dataKey="month" stroke="rgba(0,0,0,0.7)" />
            <YAxis stroke="rgba(0,0,0,0.7)" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ stroke: "#4f46e5", strokeWidth: 2, r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.map((d) => (
          <div
            key={d.month}
            className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg backdrop-filter backdrop-blur-sm"
          >
            <h3 className="font-medium text-gray-800 dark:text-gray-200">{d.month}</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{d.value.toLocaleString()}</p>
            {d.is_anomaly && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                Anomaly ({d.severity})
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
