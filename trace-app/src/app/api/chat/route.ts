import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { GoogleGenAI } from "@google/genai";

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

function buildContext(analysis: any, message: string): string {
  const parts: string[] = [];
  
  parts.push("You are TRACE, an evidence-grounded business intelligence analyst.");
  parts.push("Answer ONLY from the supplied analysis/evidence context below.");
  parts.push("Distinguish correlation/association from causation.");
  parts.push("If evidence is insufficient, explicitly say so.");
  parts.push("Never invent missing data or hallucinate facts.");
  parts.push("When possible, reference the relevant evidence/hypothesis by name.");
  parts.push("");
  
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
  parts.push("- Cite specific evidence/hypotheses when making claims.");
  parts.push("- Use format: 'Evidence from [Hypothesis X] shows...' or 'Hypothesis Y states...'");
  parts.push("- If evidence is insufficient, say: 'The available evidence does not support a conclusion about...'");
  parts.push("- Never say 'based on the data' without specifying which hypothesis/evidence.");
  parts.push("- Distinguish 'associated with' from 'caused by'.");
  
  return parts.join("\n");
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
  try {
    const body: ChatRequest = await request.json();
    const { analysisId, datasetId, message, context } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!analysisId && !datasetId) {
      return NextResponse.json({ 
        response: "I need an analysis context to answer questions. Please run an analysis first from the Data page, then return here with the analysis ID.",
        sources: []
      }, { status: 200 });
    }

    let analysis = context;
    
    if (!analysis && analysisId) {
      const db = await getDB();
      const analysisRecord = await db.get(
        "SELECT * FROM analysis_runs WHERE id = ?",
        parseInt(analysisId)
      );
      
      if (analysisRecord) {
        analysis = {
          ...analysisRecord,
          kpi_result: analysisRecord.kpi_result ? JSON.parse(analysisRecord.kpi_result) : null,
          signal_result: analysisRecord.signal_result ? JSON.parse(analysisRecord.signal_result) : null,
          driver_result: analysisRecord.driver_result ? JSON.parse(analysisRecord.driver_result) : null,
          evidence_result: analysisRecord.evidence_result ? JSON.parse(analysisRecord.evidence_result) : null,
          filters: analysisRecord.filters ? JSON.parse(analysisRecord.filters) : null,
        };
      }
    }

    if (!analysis) {
      return NextResponse.json({ 
        response: "I couldn't find the analysis data. Please run an analysis first.",
        sources: []
      }, { status: 200 });
    }

    const systemPrompt = buildContext(analysis, message);
    const sources = extractSources(analysis);

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        response: `TRACE's language model is currently unavailable. I can still show the structured findings from this investigation:

**KPI Summary (${analysis.kpi?.label || analysis.metric}):** ${analysis.kpi?.changePct >= 0 ? "+" : ""}${analysis.kpi?.changePct?.toFixed(1)}% (${analysis.kpi?.value} ${analysis.kpi?.unit} vs ${analysis.kpi?.previousValue} ${analysis.kpi?.unit})

**Top Drivers:**
${analysis.driver?.drivers?.filter((d: any) => d.status !== "insufficient_data").map((d: any) => `- ${d.name}: ${(d.confidence * 100).toFixed(0)}% confidence (${d.status})`).join("\n") || "None"}

**Evidence Status:** ${analysis.evidence?.status} (${analysis.evidence?.hypotheses?.length || 0} hypotheses, ${analysis.evidence?.overallConfidence ? (analysis.evidence.overallConfidence * 100).toFixed(0) : 0}% overall confidence)

**Key Contradictions:** ${analysis.evidence?.contradictions?.length || 0} detected

Ask me about specific drivers, evidence, or recommendations.`,
        sources
      }, { status: 200 });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash",
      contents: systemPrompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    });

    const responseText = result.text || "I couldn't generate a response. Please try again.";

    return NextResponse.json({
      response: responseText,
      sources,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    
    if (error instanceof Error && error.message.includes("API key")) {
      return NextResponse.json({
        response: "TRACE's language model is currently unavailable (missing API key). I can still show the structured findings from this investigation. Please configure GEMINI_API_KEY to enable AI responses.",
        sources: []
      }, { status: 200 });
    }
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Chat failed",
      sources: []
    }, { status: 500 });
  }
}