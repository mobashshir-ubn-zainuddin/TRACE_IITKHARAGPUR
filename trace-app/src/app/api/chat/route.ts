import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/server/db";
import Groq from "groq-sdk";

// Verified against GET https://api.groq.com/openai/v1/models with the
// project's live GROQ_API_KEY: no llama-3.x chat model is active on this
// account, so we use openai/gpt-oss-20b - a low-latency reasoning model
// (explicitly supports "reasoning"/"structured_outputs") that was confirmed
// active and returns fast, grounded answers against this app's system prompt.
const GROQ_MODEL = "openai/gpt-oss-20b";

interface ChatRequest {
  analysisId?: string;
  datasetId?: string;
  message: string;
  context?: any;
}

interface ChatResponse {
  response: string;
  sources?: Array<{ id: string; label: string; text: string }>;
  error?: string;
}

const FALLBACK_SENTENCE =
  "I don't have enough evidence in the current analysis to answer that reliably.";

function buildContext(analysis: any, message: string): string {
  const parts: string[] = [];

  parts.push("You are TRACE, an evidence-grounded business intelligence analyst embedded in the TRACE web app.");
  parts.push("You handle three kinds of questions:");
  parts.push("1) Website guide questions (\"how do I...\", \"what is the X page\") - answer using the TRACE WEBSITE GUIDE below.");
  parts.push("2) Questions about the current dataset/analysis (KPI values, drivers, evidence, contradictions, recommendations) - answer ONLY from the ANALYSIS CONTEXT below.");
  parts.push("3) General questions about what TRACE is/how it works - answer using the WHAT TRACE IS section below.");
  parts.push("");
  parts.push("Style: clear, concise, business-analyst tone; avoid jargon unless asked. Distinguish correlation/association from causation.");
  parts.push("When making a claim about the data, mention which KPI/driver/evidence/hypothesis it comes from. Flag uncertainty and contradictions explicitly. Suggest a next investigation step when relevant.");
  parts.push("Never invent numbers, drivers, or evidence not present in the ANALYSIS CONTEXT below.");
  parts.push(`If a data question cannot be answered from the ANALYSIS CONTEXT below, respond with exactly this sentence: "${FALLBACK_SENTENCE}"`);
  parts.push("");

  parts.push("=== TRACE WEBSITE GUIDE ===");
  parts.push("- Data page (/data): upload a CSV/XLSX/JSON/PDF/TXT/MD file (max 50MB), review the file preview and column mapping, then click \"Upload & Analyze\".");
  parts.push("- Dashboard (/dashboard): governed KPIs, trends and signals for the business.");
  parts.push("- Investigations (/investigate): driver hypotheses, contribution breakdowns, and evidence for a KPI signal.");
  parts.push("- Chat (this page): ask about the current analysis or how to use TRACE.");
  parts.push("- Workflow: Data -> Upload dataset -> Review file preview -> Review column mapping -> Upload & Analyze -> Dashboard -> Investigations -> Chat.");
  parts.push("");

  parts.push("=== WHAT TRACE IS ===");
  parts.push("TRACE computes governed KPIs from sales/marketing/operations data (M1), detects statistically significant signals/anomalies in those KPIs (M2), generates and tests driver hypotheses using association/contribution/segmentation analysis (M3), and retrieves + scores unstructured evidence (documents/reports) to support or contradict each hypothesis, producing a confidence-scored, evidence-linked explanation (M4).");
  parts.push("");

  if (!analysis) {
    parts.push("=== ANALYSIS CONTEXT ===");
    parts.push("No analysis is currently loaded (the user has not uploaded/analyzed a dataset yet).");
    parts.push("Only answer website-guide or general TRACE questions. For any data-specific question, use the fallback sentence above.");
    parts.push("");
    parts.push(`USER QUESTION: ${message}`);
    return parts.join("\n");
  }

  parts.push("=== ANALYSIS CONTEXT ===");

  if (analysis?.kpi) {
    const kpi = analysis.kpi;
    parts.push(`KPI: ${kpi.label} (${kpi.metric})`);
    parts.push(`Period: ${kpi.period}`);
    parts.push(`Current Value: ${kpi.value} ${kpi.unit}`);
    parts.push(`Previous Value: ${kpi.previousValue} ${kpi.unit}`);
    parts.push(`Change: ${kpi.changePct >= 0 ? "+" : ""}${kpi.changePct.toFixed(1)}%`);
    if (kpi.dimensions) {
      parts.push(`Dimensions: ${JSON.stringify(kpi.dimensions)}`);
    }
    parts.push("");
  }
  
  if (analysis?.signal) {
    const s = analysis.signal;
    parts.push("SIGNAL DETECTION:");
    parts.push(`  Strength: ${(s.signalStrength * 100).toFixed(0)}%`);
    parts.push(`  Priority: ${s.priority}`);
    parts.push(`  Status: ${s.status}`);
    parts.push(`  Statistical Significance: ${s.statisticalSignificance}`);
    parts.push(`  Materiality: ${s.materiality}`);
    if (s.deviation.zScore) parts.push(`  Z-Score: ${s.deviation.zScore.toFixed(2)}`);
    if (s.seasonality.adjusted) parts.push(`  YoY Change: ${s.seasonality.yoyChangePct?.toFixed(1)}%`);
    parts.push("");
  }
  
  if (analysis?.driver) {
    const d = analysis.driver;
    parts.push("DRIVER HYPOTHESES:");
    parts.push(`  Total Change: ${d.totalChangePct.toFixed(1)}%`);
    if (d.dimensions?.length) {
      parts.push("  Dimension Breakdown:");
      d.dimensions.forEach((dim: any) => {
        parts.push(`    ${dim.dimensionValue}: ${dim.changePct?.toFixed(1)}% (${dim.contributionPct.toFixed(1)}% contribution)`);
      });
    }
    parts.push("");
    parts.push("  Hypotheses:");
    d.drivers?.forEach((h: any) => {
      if (h.status !== "insufficient_data") {
        parts.push(`    ${h.name} (${h.driver}):`);
        parts.push(`      Claim: ${h.claim}`);
        parts.push(`      Expected Direction: ${h.expectedDirection}`);
        parts.push(`      Confidence: ${(h.confidence * 100).toFixed(0)}%`);
        parts.push(`      Status: ${h.status}`);
        if (h.associationScore) parts.push(`      Association: ${h.associationScore.toFixed(2)}`);
        if (h.evidenceAvailability) parts.push(`      Evidence Availability: ${(h.evidenceAvailability * 100).toFixed(0)}%`);
        if (h.contradictions?.length) {
          parts.push(`      Contradictions: ${h.contradictions.length}`);
          h.contradictions.forEach((c: any) => {
            parts.push(`        - ${c.effect}: ${c.explanation || c.metric}`);
          });
        }
        parts.push("");
      }
    });
    parts.push("");
  }
  
  if (analysis?.evidence) {
    const e = analysis.evidence;
    parts.push("EVIDENCE:");
    parts.push(`  Overall Confidence: ${(e.overallConfidence * 100).toFixed(0)}%`);
    parts.push(`  Status: ${e.status}`);
    parts.push(`  Total Evidence Items: ${e.allEvidence?.length || 0}`);
    parts.push(`  Supporting: ${e.hypotheses?.reduce((sum: number, h: any) => sum + h.supportingEvidenceIds.length, 0) || 0}`);
    parts.push(`  Contradicting: ${e.hypotheses?.reduce((sum: number, h: any) => sum + h.contradictoryEvidenceIds.length, 0) || 0}`);
    parts.push(`  Evidence Gaps: ${e.evidenceGaps?.length || 0}`);
    if (e.evidenceGaps?.length) {
      e.evidenceGaps.forEach((gap: any) => {
        parts.push(`    - ${gap.type}: ${gap.description} (${gap.impact})`);
      });
    }
    if (e.contradictions?.length) {
      parts.push("  Cross-Hypothesis Contradictions:");
      e.contradictions.forEach((c: any) => {
        parts.push(`    - ${c.driver}: ${c.description} (${c.severity})`);
      });
    }
    parts.push("");
  }
  
  if (analysis?.provenance) {
    parts.push("PROVENANCE:");
    parts.push(`  Sources: ${analysis.provenance.length} provenance records available`);
    parts.push("");
  }
  
  parts.push(`USER QUESTION: ${message}`);
  parts.push("");
  parts.push("INSTRUCTIONS:");
  parts.push("- Answer concisely but completely.");
  parts.push("- For data questions, structure the answer as: (1) direct answer, (2) relevant KPI change, (3) main driver, (4) supporting evidence, (5) confidence/uncertainty, (6) a recommended next investigation step if available.");
  parts.push("- Cite specific evidence/hypotheses when making claims.");
  parts.push("- Use format: 'Evidence from [Hypothesis X] shows...' or 'Hypothesis Y states...'");
  parts.push(`- If the ANALYSIS CONTEXT above does not contain what's needed to answer a data question, respond with exactly: "${FALLBACK_SENTENCE}"`);
  parts.push("- Never say 'based on the data' without specifying which hypothesis/evidence.");
  parts.push("- Distinguish 'associated with' from 'caused by'.");

  return parts.join("\n");
}

function buildDeterministicFallback(analysis: any, reason: string): string {
  if (!analysis) {
    return "Upload and analyze a dataset from the Data page first. Once the analysis completes, I can explain the results and answer questions about the data.";
  }

  const kpi = analysis.kpi;
  const drivers = analysis.driver?.drivers?.filter((d: any) => d.status !== "insufficient_data") || [];
  const evidence = analysis.evidence;

  return `TRACE's language model is currently unavailable (${reason}). Here are the structured findings from this investigation:

**KPI Summary (${kpi?.label || analysis.metric}):** ${kpi?.changePct >= 0 ? "+" : ""}${kpi?.changePct?.toFixed(1) ?? "n/a"}% (${kpi?.value ?? "n/a"} ${kpi?.unit ?? ""} vs ${kpi?.previousValue ?? "n/a"} ${kpi?.unit ?? ""})

**Top Drivers:**
${drivers.length ? drivers.map((d: any) => `- ${d.name}: ${(d.confidence * 100).toFixed(0)}% confidence (${d.status})`).join("\n") : "None available"}

**Evidence Status:** ${evidence?.status ?? "unknown"} (${evidence?.hypotheses?.length || 0} hypotheses, ${evidence?.overallConfidence ? (evidence.overallConfidence * 100).toFixed(0) : 0}% overall confidence)

**Key Contradictions:** ${evidence?.contradictions?.length || 0} detected

Ask me about specific drivers, evidence, or recommendations once the language model is back.`;
}

function extractSources(analysis: any): Array<{ id: string; label: string; text: string }> {
  const sources: Array<{ id: string; label: string; text: string }> = [];
  
  if (analysis?.evidence?.hypotheses) {
    for (const h of analysis.evidence.hypotheses) {
      for (const e of analysis.evidence.allEvidence || []) {
        if (h.supportingEvidenceIds.includes(e.id) || h.contradictoryEvidenceIds.includes(e.id)) {
          sources.push({
            id: e.id,
            label: `${h.name} (${e.direction})`,
            text: e.text.substring(0, 500),
          });
        }
      }
    }
  }
  
  return sources.slice(0, 10);
}

export async function POST(request: NextRequest) {
  // Kept in the outer scope so the catch block can still build a
  // deterministic fallback response from whatever context we'd resolved
  // before a Groq call failed.
  let analysis: any = null;
  let sources: Array<{ id: string; label: string; text: string }> = [];

  try {
    const body: ChatRequest = await request.json();
    const { analysisId, datasetId, message, context } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const db = await getDB();

    function normalizeAnalysisRecord(record: any) {
      return {
        ...record,
        kpi: record.kpi_result ? JSON.parse(record.kpi_result) : null,
        signal: record.signal_result ? JSON.parse(record.signal_result) : null,
        driver: record.driver_result ? JSON.parse(record.driver_result) : null,
        evidence: record.evidence_result ? JSON.parse(record.evidence_result) : null,
        filters: record.filters ? JSON.parse(record.filters) : null,
      };
    }

    analysis = context && context.id ? context : null;

    if (!analysis && analysisId) {
      const analysisRecord = await db.get(
        "SELECT * FROM analysis_runs WHERE id = ?",
        parseInt(analysisId)
      );
      if (analysisRecord) analysis = normalizeAnalysisRecord(analysisRecord);
    }

    if (!analysis && datasetId) {
      // No explicit analysisId - fall back to the most recent completed run
      // for this dataset, so the caller never has to look up an id manually.
      const analysisRecord = await db.get(
        `SELECT * FROM analysis_runs WHERE dataset_id = ? AND status = 'completed'
         ORDER BY datetime(COALESCE(completed_at, created_at)) DESC, id DESC LIMIT 1`,
        parseInt(datasetId)
      );
      if (analysisRecord) analysis = normalizeAnalysisRecord(analysisRecord);
    }

    if (!analysis && !analysisId && !datasetId) {
      // No context supplied at all - fall back to the most recent completed
      // analysis in the system, matching the same behavior /api/analyze GET
      // already uses for entry points that don't carry an explicit id.
      const analysisRecord = await db.get(
        `SELECT * FROM analysis_runs WHERE status = 'completed'
         ORDER BY datetime(COALESCE(completed_at, created_at)) DESC, id DESC LIMIT 1`
      );
      if (analysisRecord) analysis = normalizeAnalysisRecord(analysisRecord);
    }

    // `analysis` may still be null here (no dataset has ever been analyzed) -
    // that's fine: buildContext() and the fallbacks below handle it by
    // sticking to website-guide/general TRACE questions.
    const systemPrompt = buildContext(analysis, message);
    sources = extractSources(analysis);

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: buildDeterministicFallback(analysis, "missing GROQ_API_KEY"),
        sources,
      }, { status: 200 });
    }

    const groq = new Groq({ apiKey });

    const result = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const responseText = result.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

    return NextResponse.json({
      response: responseText,
      sources,
    });
  } catch (error) {
    // Never log the raw error object as-is if it might carry auth headers -
    // just the message, which is what Groq's SDK puts the useful detail in.
    console.error("Chat API error:", error instanceof Error ? error.message : "unknown error");

    // Never let a Groq/API failure break the demo - fall back to a
    // deterministic, structured-analysis response built from whatever
    // analysis context we'd already resolved above.
    const reason = error instanceof Error && /api key|authent|401/i.test(error.message)
      ? "invalid/missing API key"
      : error instanceof Error && /rate.?limit|429/i.test(error.message)
      ? "rate limited"
      : error instanceof Error && /timeout|ETIMEDOUT|timed out/i.test(error.message)
      ? "request timed out"
      : "temporary error";
    return NextResponse.json({
      response: buildDeterministicFallback(analysis, reason),
      sources,
    }, { status: 200 });
  }
}