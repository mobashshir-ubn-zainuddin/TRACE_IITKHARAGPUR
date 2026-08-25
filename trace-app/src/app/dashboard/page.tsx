"use client";
// src/app/dashboard/page.tsx
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Loader2, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Minus, Target } from "lucide-react";

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

interface KPISignal {
  id: string;
  metric: string;
  period: string;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  changePct: number;
  baseline: {
    mean: number;
    median: number;
    stdDev: number;
    mad?: number;
    percentiles?: { p10?: number; p25?: number; p50?: number; p75?: number; p90?: number };
  };
  deviation: { zScore?: number; robustZScore?: number };
  seasonality: { adjusted: boolean; yoyChangePct?: number };
  statisticalSignificance: "none" | "low" | "medium" | "high";
  materiality: "low" | "medium" | "high";
  signalStrength: number;
  priority: "low" | "medium" | "high" | "critical";
  status: "normal" | "watch" | "investigate" | "urgent";
  confidence: number;
  dataQualityImpact: number;
  reasons: string[];
  reasonCodes: string[];
  explanation: {
    summary: {
      direction: "up" | "down" | "flat";
      magnitudePct: number;
      materiality: "low" | "medium" | "high";
      statisticalSignificance: "none" | "low" | "medium" | "high";
    };
    reasons: string[];
  };
  dimensions?: Record<string, string>;
  candidateInvestigationWindow?: { start: string; end: string };
  telemetry?: { calculationLatencyMs: number; historyLength: number; method: string[] };
}

interface TopSignal {
  metric: string;
  dimension: string;
  changePct: number;
  priority: string;
  signalStrength: number;
}

interface SignalHistoryItem {
  period: string;
  signalStrength: number;
  status: string;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(Math.round(num));
}

function formatPct(num: number): string {
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "urgent": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "investigate": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "watch": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "normal": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "urgent": return <AlertTriangle className="w-4 h-4 text-red-600" />;
    case "investigate": return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    case "watch": return <Target className="w-4 h-4 text-yellow-600" />;
    case "normal": return <CheckCircle className="w-4 h-4 text-green-600" />;
    default: return <Minus className="w-4 h-4 text-gray-600" />;
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "critical": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "high": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "low": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getMetricLabel(metric: string): string {
  switch (metric) {
    case "revenue": return "Revenue";
    case "orders": return "Orders";
    case "aov": return "Avg Order Value";
    case "conversion": return "Conversion Rate";
    case "marketingROI": return "Marketing ROI";
    default: return metric;
  }
}

function SignalBadge({ status, priority, signalStrength, confidence }: { 
  status: string; 
  priority: string; 
  signalStrength: number; 
  confidence: number; 
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
        {getStatusIcon(status)} {status.toUpperCase()}
      </span>
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(priority)}`}>
        Priority: {priority.toUpperCase()}
      </span>
      <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        Strength: {signalStrength.toFixed(2)}
      </span>
      <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
        Confidence: {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function CurrentSignalSection({ signal, loading, error }: { 
  signal: KPISignal | null; 
  loading: boolean; 
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/4 mb-4"></div>
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Signal data unavailable</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  const { 
    currentValue, previousValue, changePct,
    status, priority, signalStrength, confidence, materiality, 
    statisticalSignificance, reasons, explanation,
    deviation, seasonality, baseline
  } = signal;

  const directionIcon = changePct > 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : changePct < 0 ? <TrendingDown className="w-5 h-5 text-red-600" /> : <Minus className="w-5 h-5 text-gray-600" />;

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-blue-500">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Current Signal</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Period: {signal.period} | Metric: {getMetricLabel(signal.metric)}</p>
        </div>
        <SignalBadge status={status} priority={priority} signalStrength={signalStrength} confidence={confidence} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Current Value</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(currentValue)}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Previous Value</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(previousValue)}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">MoM Change</p>
          <p className="text-2xl font-bold flex items-center gap-1" style={{ color: changePct > 0 ? 'green' : changePct < 0 ? 'red' : 'gray' }}>
            {directionIcon} {formatPct(changePct)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Materiality</p>
          <p className="font-medium capitalize">{materiality}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Statistical Significance</p>
          <p className="font-medium capitalize">{statisticalSignificance}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Z-Score</p>
          <p className="font-medium">{deviation.zScore?.toFixed(2) ?? "N/A"}</p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">YoY Change</p>
          <p className="font-medium">{seasonality.yoyChangePct ? formatPct(seasonality.yoyChangePct) : "N/A"}</p>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" /> Why This Matters
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          {explanation.summary.direction === "down" ? "Revenue decreased" : explanation.summary.direction === "up" ? "Revenue increased" : "Revenue remained flat"} 
          {Math.abs(explanation.summary.magnitudePct).toFixed(2)}% 
          ({explanation.summary.materiality} materiality, {explanation.summary.statisticalSignificance} statistical significance).
        </p>
        {reasons.length > 0 && (
          <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            {reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400">•</span>
                {reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="mt-4">
        <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
          Show technical details
        </summary>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1 font-mono">
          <div>Baseline Mean: {formatNumber(baseline.mean)}</div>
          <div>Baseline StdDev: {formatNumber(baseline.stdDev)}</div>
          <div>Robust Z-Score: {deviation.robustZScore?.toFixed(2) ?? "N/A"}</div>
          <div>Seasonality Adjusted: {seasonality.adjusted ? "Yes" : "No"}</div>
          <div>Data Quality Impact: {(signal.dataQualityImpact * 100).toFixed(0)}%</div>
          <div>Reason Codes: {signal.reasonCodes.join(", ") || "None"}</div>
        </div>
      </details>
    </div>
  );
}

function TopSignalsSection({ signals, loading, error, period }: { 
  signals: TopSignal[]; 
  loading: boolean; 
  error: string | null;
  period: string;
}) {
  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/4 mb-4"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 dark:bg-zinc-700 rounded mb-2"></div>
        ))}
      </div>
    );
  }

  if (error || signals.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Top signals unavailable</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Target className="w-5 h-5 text-blue-600" /> Top Signals — {period}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-zinc-700">
              <th className="pb-2 px-2 font-medium">KPI</th>
              <th className="pb-2 px-2 font-medium text-right">Change %</th>
              <th className="pb-2 px-2 font-medium text-center">Priority</th>
              <th className="pb-2 px-2 font-medium text-center">Strength</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => (
              <tr key={`${s.metric}-${i}`} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900">
                <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{getMetricLabel(s.metric)}</td>
                <td className="py-2 px-2 text-right" style={{ color: s.changePct > 0 ? 'green' : s.changePct < 0 ? 'red' : 'gray' }}>
                  {formatPct(s.changePct)}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(s.priority)}`}>
                    {s.priority.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 px-2 text-center font-mono text-blue-600 dark:text-blue-400">
                  {s.signalStrength.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalHistorySection({ history, loading, error }: { 
  history: SignalHistoryItem[]; 
  loading: boolean; 
  error: string | null;
}) {
  if (loading || !history || history.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Signal history unavailable</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-600" /> Signal Strength History
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={history.reverse()}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
          <XAxis dataKey="period" stroke="rgba(0,0,0,0.7)" />
          <YAxis stroke="rgba(0,0,0,0.7)" domain={[0, 1]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="signalStrength"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ stroke: "#4f46e5", strokeWidth: 2, r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-2 overflow-x-auto">
        {history.slice(-6).reverse().map((h) => (
          <span key={h.period} className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getStatusColor(h.status)}`}>
            {h.period}: {h.status.toUpperCase()} ({h.signalStrength.toFixed(2)})
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [metric, setMetric] = useState<string>("revenue");
  const [data, setData] = useState<KPIData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Module 2 state
  const [signal, setSignal] = useState<KPISignal | null>(null);
  const [signalLoading, setSignalLoading] = useState<boolean>(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  
  const [topSignals, setTopSignals] = useState<TopSignal[]>([]);
  const [topSignalsLoading, setTopSignalsLoading] = useState<boolean>(false);
  const [topSignalsError, setTopSignalsError] = useState<string | null>(null);
  
  const [signalHistory, setSignalHistory] = useState<SignalHistoryItem[]>([]);
  const [signalHistoryLoading, setSignalHistoryLoading] = useState<boolean>(false);

  // Derive the latest period from the data
  const latestPeriod = data.length > 0 ? data[data.length - 1].month : new Date().toISOString().slice(0, 7);

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
        const mappedData = results.map((r: KPIApiResponse) => ({
          month: r.month,
          value: r.value,
          is_anomaly: r.is_anomaly,
          severity: r.severity,
        }));
        setData(mappedData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchKPI();
  }, [metric]);

  // Fetch current signal for the selected metric and latest period
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchSignal() {
      setSignalLoading(true);
      setSignalError(null);
      try {
        const res = await fetch(`/api/signals?metric=${metric}&period=${latestPeriod}`);
        if (!res.ok) throw new Error(`Failed to fetch signal: ${res.status}`);
        const data = await res.json();
        setSignal(data);
      } catch (e) {
        setSignalError(e instanceof Error ? e.message : "Failed to load signal");
      } finally {
        setSignalLoading(false);
      }
    }
    fetchSignal();
  }, [metric, latestPeriod]);

  // Fetch top signals for the latest period
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchTopSignals() {
      setTopSignalsLoading(true);
      setTopSignalsError(null);
      try {
        const res = await fetch(`/api/signals/top?period=${latestPeriod}&limit=10`);
        if (!res.ok) throw new Error(`Failed to fetch top signals: ${res.status}`);
        const data = await res.json();
        setTopSignals(data.signals || []);
      } catch (e) {
        setTopSignalsError(e instanceof Error ? e.message : "Failed to load top signals");
      } finally {
        setTopSignalsLoading(false);
      }
    }
    fetchTopSignals();
  }, [latestPeriod]);

  // Fetch signal history for the selected metric
  useEffect(() => {
    async function fetchSignalHistory() {
      setSignalHistoryLoading(true);
      try {
        const res = await fetch(`/api/signals/history?metric=${metric}`);
        if (!res.ok) throw new Error(`Failed to fetch signal history: ${res.status}`);
        const data = await res.json();
        setSignalHistory(data.history || []);
      } catch (e) {
        console.error("Signal history error:", e);
      } finally {
        setSignalHistoryLoading(false);
      }
    }
    fetchSignalHistory();
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
          <option value="conversion">Conversion Rate</option>
          <option value="marketingROI">Marketing ROI</option>
        </select>
        {loading && (
          <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <Loader2 className="animate-spin" /> Loading…
          </span>
        )}
      </div>

      {/* Module 2: Current Signal Section */}
      <CurrentSignalSection 
        signal={signal} 
        loading={signalLoading} 
        error={signalError} 
      />

      {/* Module 2: Top Signals Section */}
      <TopSignalsSection 
        signals={topSignals} 
        loading={topSignalsLoading} 
        error={topSignalsError}
        period={latestPeriod}
      />

      {/* Module 2: Signal History Section (Optional) */}
      <SignalHistorySection 
        history={signalHistory} 
        loading={signalHistoryLoading} 
        error={null}
      />

      {/* Existing KPI Chart & Cards - Preserved */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mt-6">
          <Loader2 className="animate-spin" /> Loading KPI data…
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={400} className="mt-6">
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
        </>
      )}
    </section>
  );
}
