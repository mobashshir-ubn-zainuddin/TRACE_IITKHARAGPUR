// src/app/driver-decomposition/page.tsx
"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

/**
 * Revenue decomposition by region.
 *
 * This page previously split total revenue evenly across regions using "static
 * mock percentages", which presented fabricated numbers as a real decomposition.
 * It now reads the actual per-region contribution from /api/drivers/breakdown.
 *
 * Two distinct quantities are shown, and they must not be conflated:
 *   Net contribution  = change / totalChange * 100   (may exceed 100% or be negative)
 *   Magnitude share   = |change| / sum|change| * 100 (sums to ~100%)
 */
type RegionRow = {
  region: string;
  change: number;
  changePct: number | null;
  signedContributionPct: number | null;
  magnitudeContributionPct: number | null;
};

export default function DriverDecomposition() {
  // The dataset spans 2025-03 .. 2026-08; default to the latest period.
  const [month, setMonth] = useState<string>("2026-08");
  const [data, setData] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/drivers/breakdown?metric=revenue&period=${encodeURIComponent(month)}&dimension=region`
        );
        const json = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(json?.error ?? `HTTP ${res.status}`);
          setData([]);
          return;
        }

        setData(
          (json.contributions ?? []).map((c: {
            name: string;
            change: number;
            changePct: number | null;
            signedContributionPct: number | null;
            magnitudeContributionPct: number | null;
          }) => ({
            region: c.name,
            change: c.change,
            changePct: c.changePct,
            signedContributionPct: c.signedContributionPct,
            magnitudeContributionPct: c.magnitudeContributionPct,
          }))
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load decomposition");
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [month]);

  return (
    <section className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <h1 className="text-2xl font-bold mb-1 text-black dark:text-white">
        Driver Decomposition – Revenue by Region
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Period-over-period change in net revenue, by region.
      </p>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-gray-800 dark:text-gray-200">Month:</label>
        <input
          type="month"
          value={month}
          min="2025-04"
          max="2026-08"
          onChange={(e) => setMonth(e.target.value)}
          className="rounded p-2 bg-white dark:bg-zinc-800 text-black dark:text-gray-100"
        />
      </div>

      {loading ? (
        <p className="text-gray-600 dark:text-gray-300">Loading…</p>
      ) : error ? (
        <p className="text-red-600 dark:text-red-400">Could not load decomposition: {error}</p>
      ) : data.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-300">No data for this period.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
              <XAxis dataKey="region" stroke="rgba(0,0,0,0.7)" />
              <YAxis stroke="rgba(0,0,0,0.7)" />
              <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : String(v))} />
              <Bar dataKey="change" name="Change in revenue" fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-zinc-700">
                  <th className="py-2 pr-4 font-medium">Region</th>
                  <th className="py-2 pr-4 font-medium text-right">Change</th>
                  <th className="py-2 pr-4 font-medium text-right">Change %</th>
                  <th className="py-2 pr-4 font-medium text-right" title="Share of the net change. Can exceed 100% or be negative when regions offset each other.">
                    Net contribution
                  </th>
                  <th className="py-2 font-medium text-right" title="Share of total absolute movement. Sums to ~100%.">
                    Magnitude share
                  </th>
                </tr>
              </thead>
              <tbody className="text-black dark:text-gray-100">
                {data.map((r) => (
                  <tr key={r.region} className="border-b border-gray-200 dark:border-zinc-800">
                    <td className="py-2 pr-4 font-medium">{r.region}</td>
                    <td className={`py-2 pr-4 text-right font-mono ${r.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {r.change.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {r.changePct != null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%` : "n/a"}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {r.signedContributionPct != null
                        ? `${r.signedContributionPct >= 0 ? "+" : ""}${r.signedContributionPct.toFixed(1)}%`
                        : "n/a"}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {r.magnitudeContributionPct != null ? `${r.magnitudeContributionPct.toFixed(1)}%` : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Net contribution is each region&apos;s share of the <em>net</em> change and may exceed 100% or be
              negative when regions move in opposite directions. Magnitude share is each region&apos;s share of
              total <em>absolute</em> movement and sums to approximately 100%.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
