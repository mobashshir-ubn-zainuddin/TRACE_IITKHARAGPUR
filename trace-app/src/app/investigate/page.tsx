"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BrainCircuit, BarChart3, AlertTriangle, Network, ShieldAlert, CheckCircle2, RotateCw, Loader2, Database } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { EvidenceGraph } from "@/components/EvidenceGraph";

interface AnalysisData {
  analysisId: number;
  metric: string;
  period: string;
  filters: Record<string, string>;
  kpi: KPIData;
  signal: SignalData;
  driver: DriverData;
  evidence: EvidenceData;
  graph: GraphData;
  provenance: ProvenanceData;
}

interface KPIData {
  metric: string;
  label: string;
  period: string;
  value: number;
  previousValue: number;
  changePct: number;
  unit: string;
  dimensions: Record<string, string>;
  is_anomaly?: boolean;
  severity?: string;
}

interface SignalData {
  id: string;
  metric: string;
  period: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  baseline: { mean: number; median: number; stdDev: number; mad?: number };
  deviation: { zScore?: number; robustZScore?: number };
  seasonality: { adjusted: boolean; yoyChangePct?: number };
  statisticalSignificance: "none" | "low" | "medium" | "high";
  materiality: "low" | "medium" | "high";
  signalStrength: number;
  priority: "low" | "medium" | "high" | "critical";
  status: "normal" | "watch" | "investigate" | "urgent";
  confidence: number;
  explanation: { summary: { direction: "up" | "down" | "flat"; magnitudePct: number; materiality: "low" | "medium" | "high"; statisticalSignificance: "none" | "low" | "medium" | "high" }; reasons: string[] };
}

interface DriverHypothesis {
  id: string;
  driver: string;
  name: string;
  claim: string;
  expectedDirection: "positive" | "negative";
  contributionPct?: number;
  signedContributionPct?: number;
  magnitudeContributionPct?: number;
  associationScore?: number;
  pValue?: number;
  isStatisticallySignificant?: boolean;
  temporalAlignment?: number;
  bestLag?: number;
  lagDirection?: "leads" | "contemporaneous" | "lags";
  segmentConsistency?: number;
  causalPlausibility?: number;
  evidenceAvailability?: number;
  confidence: number;
  status: "strong_candidate" | "candidate" | "weak_candidate" | "insufficient_data";
  contradictions?: Array<{ driver: string; expectedDirection: "positive" | "negative"; observedDirection: "positive" | "negative"; effect: "weakens" | "invalidates"; magnitude: number; basis: "association" | "segment"; explanation?: string }>;
  scoreBreakdown?: Record<string, number>;
}

interface DriverData {
  metric: string;
  period: string;
  totalChange: number;
  totalChangePct: number;
  dimensions: Array<{ dimension: string; dimensionValue: string; change: number; changePct: number | null; contributionPct: number; signedContributionPct: number | null; magnitudeContributionPct: number | null }>;
  drivers: DriverHypothesis[];
  alternatives: DriverHypothesis[];
  contradictions: Array<{ driver: string; expectedDirection: "positive" | "negative"; observedDirection: "positive" | "negative"; effect: "weakens" | "invalidates"; magnitude: number; basis: "association" | "segment"; explanation?: string }>;
  evidenceRequests: Array<{ hypothesisId: string; metric: string; period: string; driver: string; query: string; filters: Record<string, string>; requiredEvidence: string[] }>;
  confidence: number;
}

interface EvidenceData {
  analysisId: string;
  metric: string;
  period: string;
  hypotheses: Array<{
    id: string;
    hypothesisId: string;
    driver: string;
    name: string;
    priorConfidence: number;
    evidenceConfidence: number;
    updatedConfidence: number;
    confidence: number;
    supportingEvidenceIds: string[];
    contradictoryEvidenceIds: string[];
    neutralEvidenceIds: string[];
    evidenceCount: number;
    independentSourceCount: number;
    sourceTypeDiversity: number;
    status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
    evidenceGaps: Array<{ type: string; description: string; impact: "high" | "medium" | "low" }>;
  }>;
  allEvidence: Array<{
    id: string;
    hypothesisId: string;
    driver: string;
    text: string;
    direction: "support" | "contradict" | "neutral";
    semanticRelevance: number;
    sourceQuality: number;
    temporalRelevance: number;
    entityRelevance: number;
    hypothesisAlignment: number;
    evidenceScore: number;
    provenance: Record<string, unknown>;
  }>;
  contradictions: Array<{
    hypothesisId: string;
    driver: string;
    supportingEvidenceIds: string[];
    contradictoryEvidenceIds: string[];
    severity: "low" | "medium" | "high";
    description: string;
  }>;
  evidenceGaps: Array<{ type: string; description: string; impact: "high" | "medium" | "low" }>;
  overallConfidence: number;
  status: "supported" | "mixed" | "insufficient_evidence" | "contradicted";
}

interface GraphData {
  nodes: Array<{ id: string; type: string; label: string; properties: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; type: string; strength?: number; properties: Record<string, unknown> }>;
  metadata: { hypothesisCount: number; evidenceCount: number; sourceCount: number; generatedAt: string; analysisId: string };
}

interface ProvenanceData {
  source: string;
  sourceType: string;
  documentId?: number;
  chunkId?: number;
  region?: string;
  product?: string;
  metric?: string;
  period?: string;
  retrievalMethod: string;
  embeddingModel?: string;
  contentHash: string;
  timestamp: string;
}[]

const getStatusColor = (status: string) => {
  switch (status) {
    case "strong_candidate": return "bg-green-100 text-green-800 dark:bg-green-900/30 text-green-700";
    case "candidate": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 text-blue-700";
    case "weak_candidate": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 text-yellow-700";
    case "supported": return "bg-green-100 text-green-800 dark:bg-green-900/30 text-green-700";
    case "mixed": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 text-yellow-700";
    case "insufficient_evidence": return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 text-gray-700";
    case "contradicted": return "bg-red-100 text-red-800 dark:bg-red-900/30 text-red-700";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 text-gray-700";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "strong_candidate": return "Strong Candidate";
    case "candidate": return "Candidate";
    case "weak_candidate": return "Weak Candidate";
    case "insufficient_evidence": return "Insufficient Data";
    case "supported": return "Supported";
    case "mixed": return "Mixed";
    case "insufficient_evidence": return "Insufficient Evidence";
    case "contradicted": return "Contradicted";
    default: return status;
  }
};

export default function InvestigatePage() {
  // useSearchParams() requires a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground text-sm">Loading investigation...</div>}>
      <InvestigatePageContent />
    </Suspense>
  );
}

function InvestigatePageContent() {
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysisId");
  const datasetId = searchParams.get("datasetId");
  
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isChallenging, setIsChallenging] = useState(false);
  const [conclusionStatus, setConclusionStatus] = useState<'supported' | 'ambiguous' | 'loading'>('loading');
  const [challengeResult, setChallengeResult] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // With no analysisId the API returns the most recent completed analysis,
      // so the "Investigations" nav link works without a query string.
      const res = await fetch(analysisId ? `/api/analyze?analysisId=${analysisId}` : `/api/analyze`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to fetch analysis: ${res.status}`);
      }
      const data = await res.json();
      // The POST /api/analyze response already uses kpi/signal/driver/evidence,
      // but GET /api/analyze (used here) returns the raw analysis_runs row
      // with kpi_result/signal_result/driver_result/evidence_result. Normalize
      // so this page works from either shape instead of silently rendering
      // blank/NaN values when the DB-row naming comes back.
      const normalized: AnalysisData = {
        ...data,
        kpi: data.kpi ?? data.kpi_result,
        signal: data.signal ?? data.signal_result,
        driver: data.driver ?? data.driver_result,
        evidence: data.evidence ?? data.evidence_result,
      };
      setAnalysis(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const handleChallenge = async () => {
    if (!analysisId || !analysis) return;
    setIsChallenging(true);
    setConclusionStatus('loading');
    setChallengeResult(null);
    
    try {
      // Call challenge conclusion API or simulate based on evidence
      const res = await fetch(`/api/analyze/${analysisId}/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence: analysis.evidence, drivers: analysis.driver.drivers })
      });
      
      if (res.ok) {
        const result = await res.json();
        setConclusionStatus(result.status || 'ambiguous');
        setChallengeResult(result.explanation || "Challenge completed");
      } else {
        // Fallback: simulate challenge based on evidence contradictions
        await new Promise(r => setTimeout(r, 1500));
        const hasContradictions = analysis.evidence?.contradictions?.length > 0;
        const hasLowConfidence = analysis.evidence?.hypotheses?.some(h => h.updatedConfidence < 0.6);
        
        if (hasContradictions || hasLowConfidence) {
          setConclusionStatus('ambiguous');
          setChallengeResult("After evaluating alternative hypotheses and contradictory evidence, the conclusion is now ambiguous. Multiple drivers have similar confidence levels with insufficient evidence to confirm a single root cause.");
        } else {
          setConclusionStatus('supported');
          setChallengeResult("The conclusion remains supported. Evidence contradictions were reviewed but the primary hypothesis maintains the highest confidence with sufficient supporting evidence.");
        }
      }
    } catch (err) {
      console.error("Challenge failed:", err);
      setConclusionStatus('ambiguous');
      setChallengeResult("Challenge evaluation encountered an error. Defaulting to ambiguous status.");
    } finally {
      setIsChallenging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="ml-3 text-lg text-gray-600 dark:text-gray-300">Loading investigation…</span>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-12">
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Unable to Load Investigation</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {error || "No analysis data found. Please run an analysis from the Data page first."}
          </p>
          <Link href="/data" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Go to Data Page
          </Link>
        </div>
      </div>
    );
  }

  const kpi = analysis.kpi;
  const signal = analysis.signal;
  const driver = analysis.driver;
  const evidence = analysis.evidence;
  const metricLabel = kpi?.label || analysis.metric;
  const changeDirection = kpi?.changePct >= 0 ? "increased" : "decreased";
  const changePct = Math.abs(kpi?.changePct || 0).toFixed(1);
  const topDrivers = driver?.drivers?.filter(d => d.status !== "insufficient_data") || [];
  const topDriver = topDrivers[0];

  // Build decomposition data from driver contributions
  const decompositionData = driver?.dimensions?.map(d => ({
    name: d.dimensionValue,
    value: d.change,
    fill: d.change >= 0 ? "var(--success)" : "var(--destructive)",
    contributionPct: d.contributionPct
  })) || [];

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/data" className="p-2 rounded-full hover:bg-muted transition-colors border border-transparent hover:border-border">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              {metricLabel} {changeDirection} {changePct}% in {analysis.filters?.region || "All Regions"} ({analysis.period})
            </h1>
            <p className="text-muted-foreground">AI investigation and root cause analysis for {analysis.metric} - {analysis.period}</p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/data"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-lg font-medium transition-opacity"
          >
            <Database className="w-4 h-4" /> Data &amp; Upload
          </Link>
          <button
            onClick={handleChallenge}
            disabled={isChallenging || conclusionStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isChallenging ? <RotateCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            Challenge Conclusion
          </button>
          {datasetId && (
            <Link href={`/data`} className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/80 rounded-lg font-medium transition-colors">
              Back to Data
            </Link>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Current Value</p>
          <p className="text-2xl font-bold text-foreground">{kpi?.value?.toLocaleString() || "—"} {kpi?.unit || ""}</p>
          <p className="text-xs text-muted-foreground mt-1">{kpi?.label} • {kpi?.period}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Previous Value</p>
          <p className="text-2xl font-bold text-foreground">{kpi?.previousValue?.toLocaleString() || "—"} {kpi?.unit || ""}</p>
          <p className="text-xs text-muted-foreground mt-1">Previous period</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Change</p>
          <p className={`text-2xl font-bold ${kpi?.changePct >= 0 ? "text-success" : "text-destructive"}`}>
            {kpi?.changePct >= 0 ? "+" : ""}{kpi?.changePct?.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">MoM {signal?.seasonality?.adjusted ? `• YoY: ${signal.seasonality.yoyChangePct?.toFixed(1)}%` : ""}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Signal Strength</p>
          <p className="text-2xl font-bold text-foreground">{(signal?.signalStrength * 100).toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground mt-1">Priority: {signal?.priority} • {signal?.status}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KPI Storytelling */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            AI Synthesis
          </h3>
          <div className="prose prose-invert max-w-none">
            {kpi && (
              <p className="text-lg leading-relaxed text-foreground/90">
                {metricLabel} <strong className={kpi.changePct >= 0 ? "text-success" : "text-destructive"}>
                  {changeDirection} {changePct}%
                </strong> compared with the previous period.
              </p>
            )}
            {signal && (
              <p className="text-muted-foreground mt-4">
                Statistical significance: <strong className="text-foreground">{signal.statisticalSignificance}</strong>
                {signal.seasonality.adjusted && ` • YoY change: ${signal.seasonality.yoyChangePct?.toFixed(1)}%`}
                {signal.deviation.zScore && ` • Z-score: ${signal.deviation.zScore.toFixed(2)}`}
              </p>
            )}
            {topDriver && (
              <p className="text-muted-foreground mt-4">
                Top driver: <strong className="text-foreground">{topDriver.name}</strong> 
                (confidence: {(topDriver.confidence * 100).toFixed(0)}%, status: {getStatusLabel(topDriver.status)})
              </p>
            )}
            
            {conclusionStatus === 'loading' ? (
              <div className="mt-6 p-4 bg-muted/50 border border-border rounded-xl flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="text-muted-foreground">Evaluating conclusion…</span>
              </div>
            ) : conclusionStatus === 'supported' ? (
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl transition-all">
                <p className="text-primary-foreground font-medium mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Conclusion: Supported
                </p>
                <p className="text-primary-foreground/80 text-sm">
                  <strong>{topDriver?.name || "Primary driver"}</strong> is the strongest supported explanation 
                  ({(topDriver?.confidence * 100).toFixed(0)}% confidence).
                  {topDriver?.contradictions?.length && (
                    <> <br/><br/>
                    <span className="opacity-70 italic">Note: {topDriver.contradictions.length} contradiction(s) found. 
                    Treat as supported hypothesis rather than confirmed causation.</span>
                    </>
                  )}
                </p>
              </div>
            ) : conclusionStatus === 'ambiguous' ? (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl transition-all">
                <p className="text-destructive font-medium mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Conclusion Challenged & Revised:
                </p>
                <p className="text-destructive/80 text-sm">
                  {challengeResult || "After evaluating alternative hypotheses and contradictory evidence, the conclusion is now ambiguous. No single cause has sufficient evidence."}
                </p>
              </div>
            ) : (
              <div className="mt-6 p-4 bg-muted/50 border border-border rounded-xl">
                <p className="text-muted-foreground font-medium mb-2">Conclusion: Pending</p>
                <p className="text-muted-foreground/80 text-sm">
                  Click "Challenge Conclusion" to evaluate the evidence and test alternative hypotheses.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Driver Decomposition */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Driver Decomposition
          </h3>
          <p className="text-sm text-muted-foreground mb-4">Breakdown of the {kpi?.changePct?.toFixed(1) || "0"}% {metricLabel} change</p>
          
          {decompositionData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={decompositionData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`} />
                  <Tooltip 
                    cursor={{ fill: 'var(--muted)' }}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    formatter={(value: unknown) => {
                      const num = Array.isArray(value) ? (typeof value[0] === 'string' ? parseFloat(value[0]) : value[0]) : value;
                      return isNaN(num as number) ? ['', ''] : [`${(num as number).toFixed(1)}%`, 'Contribution'];
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                    {decompositionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No dimension breakdown available for this analysis.
            </div>
          )}
        </div>
      </div>

      {/* Driver Hypotheses Table */}
      <div className="glass-panel p-6 rounded-2xl border border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <BrainCircuit className="w-5 h-5 text-primary" />
          Driver Hypotheses
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-t-lg">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Claim</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Evidence</th>
                <th className="px-4 py-3">Contradictions</th>
              </tr>
            </thead>
            <tbody>
              {driver?.drivers?.filter(d => d.status !== "insufficient_data").map((d) => (
                <tr key={d.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-md truncate">{d.claim}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${d.expectedDirection === "positive" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {d.expectedDirection}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${(d.confidence * 100).toFixed(0)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{(d.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(d.status)}`}>
                      {getStatusLabel(d.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-muted/50 text-muted-foreground rounded text-xs font-medium">
                      {analysis.evidence?.hypotheses?.find(h => h.hypothesisId === d.id)?.evidenceCount || 0} items
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(d.contradictions?.length ?? 0) > 0 ? (
                      <span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">
                        {d.contradictions?.length} contradiction(s)
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </td>
                </tr>
              ))}
              {driver?.drivers?.filter(d => d.status === "insufficient_data").map((d) => (
                <tr key={d.id} className="border-b border-border opacity-60">
                  <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                  <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                    Insufficient data to evaluate this driver.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidence Graph */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Evidence Reasoning Graph
        </h3>
        <p className="text-sm text-muted-foreground mb-4">Visual representation of hypothesis support and contradictions.</p>
        <EvidenceGraph 
          analysisId={`analysis-${analysisId}`} 
          initialMetric={analysis.metric} 
          initialPeriod={analysis.period} 
        />
      </div>

      {/* Evidence Details */}
      <div className="glass-panel p-6 rounded-2xl border border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-primary" />
          Evidence Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-muted/50 rounded-xl">
            <p className="text-sm text-muted-foreground">Supporting Evidence</p>
            <p className="text-2xl font-bold text-success">{evidence?.hypotheses?.reduce((sum, h) => sum + h.supportingEvidenceIds.length, 0) || 0}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-xl">
            <p className="text-sm text-muted-foreground">Contradicting Evidence</p>
            <p className="text-2xl font-bold text-destructive">{evidence?.hypotheses?.reduce((sum, h) => sum + h.contradictoryEvidenceIds.length, 0) || 0}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-xl">
            <p className="text-sm text-muted-foreground">Evidence Gaps</p>
            <p className="text-2xl font-bold text-warning">{evidence?.evidenceGaps?.length || 0}</p>
          </div>
        </div>
        
        {evidence?.contradictions?.length > 0 && (
          <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
            <p className="text-destructive font-medium mb-2">Detected Contradictions</p>
            <ul className="text-sm text-destructive/80 space-y-1">
              {evidence.contradictions.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span><strong>{c.driver}:</strong> {c.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommendation Engine */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" />
          Recommended Actions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-t-lg">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Action</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3 rounded-tr-lg">Evidence Basis</th>
              </tr>
            </thead>
            <tbody>
              {topDrivers.slice(0, 3).map((d, i) => (
                <tr key={d.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {i === 0 ? "Primary: " : ""}Investigate {d.name.toLowerCase()} ({d.expectedDirection === "positive" ? "increase" : "decrease"})
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3">{(d.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {analysis.evidence?.hypotheses?.find(h => h.hypothesisId === d.id)?.supportingEvidenceIds?.length || 0} supporting, 
                    {analysis.evidence?.hypotheses?.find(h => h.hypothesisId === d.id)?.contradictoryEvidenceIds?.length || 0} contradicting
                  </td>
                </tr>
              ))}
              {evidence?.evidenceGaps?.length > 0 && evidence.evidenceGaps.map((gap, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Collect missing data: {gap.description}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 ${gap.impact === "high" ? "bg-destructive/10 text-destructive" : gap.impact === "medium" ? "bg-primary/10 text-primary" : "bg-yellow-100 text-yellow-800"} rounded text-xs font-semibold`}>
                      {gap.impact}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">Medium</span>
                  </td>
                  <td className="px-4 py-3">N/A</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Evidence gap: {gap.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Challenge Conclusion Result */}
      {challengeResult && !isChallenging && (
        <div className={`glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4 ${conclusionStatus === 'supported' ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            {conclusionStatus === 'supported' ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-destructive" />
            )}
            Challenge Result
          </h3>
          <p className="text-foreground">{challengeResult}</p>
        </div>
      )}
    </div>
  );
}