"use client";
// src/app/dashboard/page.tsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Loader2, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Minus, Target } from "lucide-react";

interface KPIData {
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

// Module 3: Driver Decomposition & Hypothesis Engine types
interface DriverHypothesis {
  id: string;
  name: string;
  description: string;
  driver: string;
  claim: string;
  expectedDirection: "positive" | "negative";
  scope: {
    metric: string;
    period: string;
    region?: string;
    product?: string;
    channel?: string;
  };
  contributionPct?: number;
  associationScore?: number;
  temporalAlignment?: number;
  segmentConsistency?: number;
  causalPlausibility?: number;
  evidenceAvailability?: number;
  score: number;
  confidence: number;
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  caveats: string[];
}

interface DimensionContribution {
  name: string;
  change: number;
  changePct: number;
  contributionPct: number;
}

interface DriverAnalysis {
  metric: string;
  period: string;
  totalChange: number;
  totalChangePct: number;
  dimensions: DimensionContribution[];
  drivers: DriverHypothesis[];
  alternatives: DriverHypothesis[];
  contradictions: Array<{
    driver: string;
    metric: string;
    expectedDirection: "positive" | "negative";
    observedDirection: "positive" | "negative";
    effect: "weakens" | "invalidates";
    magnitude: number;
  }>;
  evidenceRequests: Array<{
    hypothesisId: string;
    metric: string;
    period: string;
    driver: string;
    query: string;
    filters: { region?: string; product?: string; dateStart?: string; dateEnd?: string };
    requiredEvidence: string[];
  }>;
  confidence: number;
}

interface BreakdownResponse {
  metric: string;
  period: string;
  dimension: string;
  contributions: DimensionContribution[];
}

interface HypothesesResponse {
  metric: string;
  period: string;
  hypotheses: DriverHypothesis[];
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

function getDirectionText(direction: "up" | "down" | "flat", metricLabel: string): string {
  switch (direction) {
    case "down": return `${metricLabel} decreased`;
    case "up": return `${metricLabel} increased`;
    case "flat": return `${metricLabel} remained flat`;
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

  const metricLabel = getMetricLabel(signal.metric);
  const directionIcon = changePct > 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : changePct < 0 ? <TrendingDown className="w-5 h-5 text-red-600" /> : <Minus className="w-5 h-5 text-gray-600" />;

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-blue-500">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Current Signal</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Period: {signal.period} | Metric: {metricLabel}</p>
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
          {getDirectionText(explanation.summary.direction, metricLabel)} 
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

// Module 3: Helper functions
function getHypothesisStatusColor(status: string): string {
  switch (status) {
    case "strong_candidate": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "candidate": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "weak_candidate": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "insufficient_data": return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getHypothesisStatusIcon(status: string) {
  switch (status) {
    case "strong_candidate": return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "candidate": return <Target className="w-4 h-4 text-blue-600" />;
    case "weak_candidate": return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    case "insufficient_data": return <Minus className="w-4 h-4 text-gray-600" />;
    default: return <Minus className="w-4 h-4 text-gray-600" />;
  }
}

function formatPctValue(num: number | undefined): string {
  if (num === undefined || num === null) return "N/A";
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
}



// Module 3: Driver Analysis Section
function DriverAnalysisSection({ analysis, loading, error }: { 
  analysis: DriverAnalysis | null; 
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

  if (error || !analysis) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Driver analysis unavailable</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  const { drivers, confidence, contradictions, period, totalChangePct } = analysis;

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-purple-500">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-600" /> Driver Analysis
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Period: {period} | Overall Change: {formatPctValue(totalChangePct)} | Confidence: {(confidence * 100).toFixed(0)}%</p>
        </div>
      </div>

      {drivers.length > 0 && (
        <div className="space-y-3 mb-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Top Drivers</h4>
          {drivers.slice(0, 5).map((driver) => (
            <div key={driver.id} className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-purple-600 dark:text-purple-400">{driver.id}</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{driver.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{driver.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getHypothesisStatusColor(driver.status)}`}>
                    {getHypothesisStatusIcon(driver.status)} {driver.status.replace("_", " ").toUpperCase()}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    Score: {driver.score.toFixed(2)}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Confidence: {(driver.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-400">
                <div>Contribution: <span className="font-medium">{formatPctValue(driver.contributionPct)}</span></div>
                <div>Association: <span className="font-medium">{driver.associationScore !== undefined ? driver.associationScore.toFixed(2) : "N/A"}</span></div>
                <div>Temporal: <span className="font-medium">{driver.temporalAlignment !== undefined ? (driver.temporalAlignment * 100).toFixed(0) + "%" : "N/A"}</span></div>
                <div>Segment: <span className="font-medium">{driver.segmentConsistency !== undefined ? (driver.segmentConsistency * 100).toFixed(0) + "%" : "N/A"}</span></div>
              </div>
              {driver.caveats.length > 0 && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {driver.caveats.map((c, idx) => <div key={idx}>⚠ {c}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {contradictions.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-red-600 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {contradictions.length} Contradiction(s) Detected
          </summary>
          <div className="mt-2 space-y-2 text-sm text-red-600 dark:text-red-400">
            {contradictions.map((c, i) => (
              <div key={i} className="p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p><strong>{c.driver}</strong>: Expected {c.expectedDirection} trend, observed {c.observedDirection} ({c.effect})</p>
                <p className="text-xs">Metric: {c.metric} | Magnitude: {c.magnitude.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Module 3: Dimension Breakdown Section
function DimensionBreakdownSection({ breakdown, loading, error, period }: { 
  breakdown: {region: DimensionContribution[]; product: DimensionContribution[]; channel: DimensionContribution[]};
  loading: boolean; 
  error: string | null;
  period: string;
}) {
  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/4 mb-4"></div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 dark:bg-zinc-700 rounded mb-2"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Dimension breakdown unavailable</p>
        <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
      </div>
    );
  }

  const dimensions = [
    { key: "region", label: "Region", data: breakdown.region },
    { key: "product", label: "Product", data: breakdown.product },
    { key: "channel", label: "Channel", data: breakdown.channel },
  ];

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-indigo-500">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Target className="w-5 h-5 text-indigo-600" /> Dimension Breakdown — {period}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dimensions.map((dim) => (
          <div key={dim.key} className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-900">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">{dim.label}</h4>
            {dim.data.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {dim.data
                  .filter(d => Math.abs(d.contributionPct) > 0.1)
                  .sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct))
                  .slice(0, 8)
                  .map((item, i) => (
                    <div key={`${dim.key}-${i}`} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900 dark:text-white truncate pr-2">{item.name}</span>
                      <div className="flex items-center gap-2 text-right">
                        <span className={`font-mono ${item.changePct >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatPctValue(item.changePct)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                          {item.contributionPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Module 3: Hypotheses Section
function HypothesesSection({ hypotheses, loading, error }: { 
  hypotheses: DriverHypothesis[]; 
  loading: boolean; 
  error: string | null;
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

  if (error || hypotheses.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-gray-400">
        <p className="text-gray-600 dark:text-gray-300">Hypotheses unavailable</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border-l-4 border-pink-500">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Target className="w-5 h-5 text-pink-600" /> Generated Hypotheses
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-zinc-700">
              <th className="pb-2 px-2 font-medium">Hypothesis</th>
              <th className="pb-2 px-2 font-medium text-center">Status</th>
              <th className="pb-2 px-2 font-medium text-center">Score</th>
              <th className="pb-2 px-2 font-medium text-center">Confidence</th>
              <th className="pb-2 px-2 font-medium text-center">Contribution</th>
              <th className="pb-2 px-2 font-medium">Claim</th>
            </tr>
          </thead>
          <tbody>
            {hypotheses.map((h) => (
              <tr key={h.id} className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900">
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-pink-600 dark:text-pink-400">{h.id}</span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{h.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{h.driver}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getHypothesisStatusColor(h.status)}`}>
                    {getHypothesisStatusIcon(h.status)} {h.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 px-2 text-center font-mono text-purple-600 dark:text-purple-400">
                  {h.score.toFixed(2)}
                </td>
                <td className="py-2 px-2 text-center font-mono text-blue-600 dark:text-blue-400">
                  {(h.confidence * 100).toFixed(0)}%
                </td>
                <td className="py-2 px-2 text-center font-mono text-indigo-600 dark:text-indigo-400">
                  {formatPctValue(h.contributionPct)}
                </td>
                <td className="py-2 px-2 text-gray-700 dark:text-gray-300 max-w-xs truncate">
                  {h.claim}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-4">
        <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
          Show hypothesis details
        </summary>
        <div className="mt-2 space-y-3 text-xs text-gray-600 dark:text-gray-400">
          {hypotheses.map((h) => (
            <div key={h.id} className="p-3 rounded bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700">
              <p className="font-medium text-gray-900 dark:text-white mb-1">{h.id}: {h.name}</p>
              <p className="mb-1">{h.claim}</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-1 text-xs">
                <span>Association: {h.associationScore !== undefined ? h.associationScore.toFixed(2) : "N/A"}</span>
                <span>Temporal: {h.temporalAlignment !== undefined ? (h.temporalAlignment * 100).toFixed(0) + "%" : "N/A"}</span>
                <span>Segment: {h.segmentConsistency !== undefined ? (h.segmentConsistency * 100).toFixed(0) + "%" : "N/A"}</span>
                <span>Causal: {h.causalPlausibility !== undefined ? (h.causalPlausibility * 100).toFixed(0) + "%" : "N/A"}</span>
                <span>Evidence: {h.evidenceAvailability !== undefined ? (h.evidenceAvailability * 100).toFixed(0) + "%" : "N/A"}</span>
                <span>Direction: {h.expectedDirection}</span>
              </div>
              {h.caveats.length > 0 && (
                <div className="mt-1 text-amber-600 dark:text-amber-400">
                  {h.caveats.map((c, idx) => <div key={idx}>⚠ {c}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// Helper hook for fetch with AbortController and generation tracking
function useFetchWithAbort<T>() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef<number>(0);

  const fetchWithAbort = useCallback(
    async (
      url: string,
      options?: RequestInit
    ): Promise<T | null> => {

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentGeneration = ++generationRef.current;

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        if (currentGeneration !== generationRef.current) {
          return null;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();

      } catch (e) {

        if (e instanceof Error && e.name === "AbortError") {
          return null;
        }

        if (currentGeneration !== generationRef.current) {
          return null;
        }

        throw e;
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    generationRef.current++;
  }, []);

  return useMemo(
    () => ({
      fetchWithAbort,
      cancel,
    }),
    [fetchWithAbort, cancel]
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

  // Module 3 state
  const [driverAnalysis, setDriverAnalysis] = useState<DriverAnalysis | null>(null);
  const [driverLoading, setDriverLoading] = useState<boolean>(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  
  const [dimensionBreakdown, setDimensionBreakdown] = useState<{region: DimensionContribution[]; product: DimensionContribution[]; channel: DimensionContribution[]}>({region: [], product: [], channel: []});
  const [breakdownLoading, setBreakdownLoading] = useState<boolean>(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  
  const [hypotheses, setHypotheses] = useState<DriverHypothesis[]>([]);
  const [hypothesesLoading, setHypothesesLoading] = useState<boolean>(false);
  const [hypothesesError, setHypothesesError] = useState<string | null>(null);

  // Request management
  const signalFetch = useFetchWithAbort<KPISignal>();
  const topSignalsFetch = useFetchWithAbort<{ signals: TopSignal[] }>();
  const historyFetch = useFetchWithAbort<{ history: SignalHistoryItem[] }>();
  const driverFetch = useFetchWithAbort<DriverAnalysis>();
  const breakdownFetch = useFetchWithAbort<BreakdownResponse>();
  const hypothesesFetch = useFetchWithAbort<HypothesesResponse>();

  // Cancel all in-flight requests when metric changes
  useEffect(() => {
    signalFetch.cancel();
    historyFetch.cancel();
    driverFetch.cancel();
    breakdownFetch.cancel();
    hypothesesFetch.cancel();
    
    // Use setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      setSignal(null);
      setSignalError(null);
      setSignalHistory([]);
      setDriverAnalysis(null);
      setDriverError(null);
      setDimensionBreakdown({region: [], product: [], channel: []});
      setBreakdownError(null);
      setHypotheses([]);
      setHypothesesError(null);
    }, 0);
  }, [metric]);

  // Derive the latest period from the data
  const latestPeriod = data.length > 0 ? data[data.length - 1].month : new Date().toISOString().slice(0, 7);

  // Fetch KPI history for chart
  useEffect(() => {
    let mounted = true;
    let currentGeneration = 0;

    async function fetchKPI() {
      setLoading(true);
      currentGeneration++;
      const gen = currentGeneration;
      
      try {
        // Use single batched history request instead of 12 individual requests
        const startMonth = new Date();
        startMonth.setMonth(startMonth.getMonth() - 11);
        const start = startMonth.toISOString().slice(0, 7);
        const end = new Date().toISOString().slice(0, 7);
        
        const response = await fetch(`/api/kpi/history?metric=${metric}&start=${start}&end=${end}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (!mounted || gen !== currentGeneration) return;
        
        const mappedData = (data.periods || [])
          .map((r: { period: string; value: number }) => ({
            month: r.period,
            value: r.value,
            is_anomaly: false, // Will be computed by signal engine
            severity: undefined,
          }))
          .sort((a: KPIData, b: KPIData) => a.month.localeCompare(b.month));

        if (mounted && gen === currentGeneration) {
          setData(mappedData);
        }
      } catch (e) {
        if (mounted && gen === currentGeneration) {
          console.error(e);
        }
      } finally {
        if (mounted && gen === currentGeneration) {
          setLoading(false);
        }
      }
    }

    fetchKPI();
    return () => { mounted = false; };
  }, [metric]);

  // Fetch current signal for the selected metric and latest period
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchSignal() {
      setSignalLoading(true);
      setSignalError(null);
      try {
        const data = await signalFetch.fetchWithAbort(`/api/signals?metric=${metric}&period=${latestPeriod}`);
        if (data) setSignal(data);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setSignalError(e.message);
        }
      } finally {
        setSignalLoading(false);
      }
    }
    fetchSignal();
  }, [metric, latestPeriod, signalFetch]);

  // Fetch top signals for the latest period
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchTopSignals() {
      setTopSignalsLoading(true);
      setTopSignalsError(null);
      try {
        const data = await topSignalsFetch.fetchWithAbort(`/api/signals/top?period=${latestPeriod}&limit=10`);
        if (data) setTopSignals(data.signals || []);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setTopSignalsError(e.message);
        }
      } finally {
        setTopSignalsLoading(false);
      }
    }
    fetchTopSignals();
  }, [latestPeriod, topSignalsFetch]);

  // Fetch signal history for the selected metric
  // Temporarily disabled to prevent blocking initial dashboard load
  // useEffect(() => {
  //   async function fetchSignalHistory() {
  //     setSignalHistoryLoading(true);
  //     try {
  //       const data = await historyFetch.fetchWithAbort(`/api/signals/history?metric=${metric}`);
  //       if (data) setSignalHistory(data.history || []);
  //     } catch (e) {
  //       if (e instanceof Error && e.name !== 'AbortError') {
  //         console.error("Signal history error:", e);
  //       }
  //     } finally {
  //       setSignalHistoryLoading(false);
  //     }
  //   }
  //   fetchSignalHistory();
  // }, [metric, historyFetch]);

  // Module 3: Fetch driver analysis
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchDriverAnalysis() {
      setDriverLoading(true);
      setDriverError(null);
      try {
        const data = await driverFetch.fetchWithAbort(`/api/drivers?metric=${metric}&period=${latestPeriod}`);
        if (data) setDriverAnalysis(data);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setDriverError(e.message);
        }
      } finally {
        setDriverLoading(false);
      }
    }
    fetchDriverAnalysis();
  }, [metric, latestPeriod, driverFetch]);

  // Module 3: Fetch dimension breakdown for region, product, channel
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchDimensionBreakdown() {
      setBreakdownLoading(true);
      setBreakdownError(null);
      try {
        const dimensions: ("region" | "product" | "channel")[] = ["region", "product", "channel"];
        const results = await Promise.allSettled(
          dimensions.map(dim => 
            breakdownFetch.fetchWithAbort(`/api/drivers/breakdown?metric=${metric}&period=${latestPeriod}&dimension=${dim}`)
          )
        );
        
        results.forEach((result, idx) => {
          if (result.status === "fulfilled") {
            const value = result.value;
            if (value && value.contributions) {
              const dimension = dimensions[idx];
              setDimensionBreakdown(prev => ({...prev, [dimension]: value.contributions}));
            }
          } else if (result.status === "rejected") {
            // Log but don't fail - some dimensions may be unsupported (e.g., channel for conversion)
            console.debug(`Dimension ${dimensions[idx]} not available for ${metric}:`, result.reason);
          }
        });
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setBreakdownError(e.message);
        }
      } finally {
        setBreakdownLoading(false);
      }
    }
    fetchDimensionBreakdown();
  }, [metric, latestPeriod, breakdownFetch]);

  // Module 3: Fetch hypotheses
  useEffect(() => {
    if (!latestPeriod) return;
    
    async function fetchHypotheses() {
      setHypothesesLoading(true);
      setHypothesesError(null);
      try {
        const data = await hypothesesFetch.fetchWithAbort(`/api/hypotheses?metric=${metric}&period=${latestPeriod}`);
        if (data) setHypotheses(data.hypotheses || []);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setHypothesesError(e.message);
        }
      } finally {
        setHypothesesLoading(false);
      }
    }
    fetchHypotheses();
  }, [metric, latestPeriod, hypothesesFetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      signalFetch.cancel();
      topSignalsFetch.cancel();
      historyFetch.cancel();
      driverFetch.cancel();
      breakdownFetch.cancel();
      hypothesesFetch.cancel();
    };
  }, []);

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
        loading={false} 
        error={null}
      />

      {/* Module 3: Driver Analysis Section */}
      <DriverAnalysisSection 
        analysis={driverAnalysis} 
        loading={driverLoading} 
        error={driverError} 
      />

      {/* Module 3: Dimension Breakdown Section */}
      <DimensionBreakdownSection 
        breakdown={dimensionBreakdown} 
        loading={breakdownLoading} 
        error={breakdownError}
        period={latestPeriod}
      />

      {/* Module 3: Hypotheses Section */}
      <HypothesesSection 
        hypotheses={hypotheses} 
        loading={hypothesesLoading} 
        error={hypothesesError} 
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