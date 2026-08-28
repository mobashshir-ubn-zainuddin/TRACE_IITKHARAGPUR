import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { computeKPI } from "@/server/kpi";
import { generateSignal } from "@/server/signal";
import { analyzeDrivers } from "@/server/driver";
import { analyzeEvidence, initializeModule4 } from "@/server/evidence";
import type { KPIResponse, KPISignal } from "@/server/types";
import type { DriverAnalysis, DriverFilters, EvidenceRequest } from "@/server/driver/types";
import type { EvidencePackage } from "@/server/evidence/types";
import { generateEvidenceRequests } from "@/server/driver/hypothesis";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { datasetId, metric, period, filters = {} } = body;

    if (!datasetId || !metric || !period) {
      return NextResponse.json(
        { error: "datasetId, metric, and period are required" },
        { status: 400 }
      );
    }

    const db = await getDB();

    // Verify dataset exists
    const dataset = await db.get(
      "SELECT * FROM uploaded_datasets WHERE id = ? AND status = 'active'",
      datasetId
    );

    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }

    // Create analysis run record
    const analysisResult = await db.run(
      `INSERT INTO analysis_runs (dataset_id, metric, period, filters, status)
       VALUES (?, ?, ?, ?, 'running')`,
      datasetId, metric, period, JSON.stringify(filters)
    );

    const analysisId = analysisResult.lastID;

    try {
      // ===== MODULE 1: KPI CALCULATION =====
      console.log(`[Analysis ${analysisId}] Running M1: KPI computation...`);
      const kpiResult: KPIResponse = await computeKPI(metric, period, filters);
      
      await db.run(
        "UPDATE analysis_runs SET kpi_result = ? WHERE id = ?",
        JSON.stringify(kpiResult),
        analysisId
      );

      // ===== MODULE 2: SIGNAL DETECTOR =====
      console.log(`[Analysis ${analysisId}] Running M2: Signal detection...`);
      const signalResult: KPISignal = await generateSignal(metric, period, filters);
      
      await db.run(
        "UPDATE analysis_runs SET signal_result = ? WHERE id = ?",
        JSON.stringify(signalResult),
        analysisId
      );

      // ===== MODULE 3: DRIVER ANALYSIS =====
      console.log(`[Analysis ${analysisId}] Running M3: Driver analysis...`);
      const driverFilters: DriverFilters = {
        region: filters.region,
        product: filters.product,
        channel: filters.channel,
        start: period,
        end: period,
      };
      
      const driverResult: DriverAnalysis = await analyzeDrivers(
        metric,
        period,
        driverFilters
      );
      
      await db.run(
        "UPDATE analysis_runs SET driver_result = ? WHERE id = ?",
        JSON.stringify(driverResult),
        analysisId
      );

      // ===== MODULE 4: EVIDENCE + RAG =====
      console.log(`[Analysis ${analysisId}] Running M4: Evidence retrieval...`);
      await initializeModule4();

      // Prepare M3 hypotheses for evidence analysis - use the same hypothesisId format as M3
      const m3Hypotheses = driverResult.drivers.map((d) => ({
        hypothesisId: d.id, // M3 assigns H1, H2, H3... 
        driver: d.driver,
        name: d.name,
        expectedDirection: d.expectedDirection,
        priorConfidence: d.confidence,
      }));

      // Prepare evidence requests using M3's generateEvidenceRequests
      const evidenceRequests: EvidenceRequest[] = driverResult.evidenceRequests || [];
      
      // If no evidence requests from M3, generate them from top drivers
      let finalEvidenceRequests = evidenceRequests;
      if (finalEvidenceRequests.length === 0 && driverResult.drivers.length > 0) {
        const topDrivers = driverResult.drivers.slice(0, 3);
        for (const d of topDrivers) {
          finalEvidenceRequests.push(
            ...generateEvidenceRequests(d.driver, metric, period, driverFilters)
          );
        }
      }

      // Run evidence analysis
      const evidenceResult = await analyzeEvidence({
        analysisId: `analysis-${analysisId}`,
        evidenceRequests: finalEvidenceRequests,
        m3Hypotheses: m3Hypotheses,
      });

      await db.run(
        "UPDATE analysis_runs SET evidence_result = ? WHERE id = ?",
        JSON.stringify(evidenceResult.evidencePackage),
        analysisId
      );

      // Mark analysis as completed
      await db.run(
        `UPDATE analysis_runs 
         SET status = 'completed', completed_at = datetime('now') 
         WHERE id = ?`,
        analysisId
      );

      return NextResponse.json({
        analysisId,
        status: "completed",
        metric,
        period,
        filters,
        kpi: kpiResult,
        signal: signalResult,
        driver: driverResult,
        evidence: evidenceResult.evidencePackage,
        graph: evidenceResult.graphData,
        provenance: evidenceResult.provenanceSummary,
      });
    } catch (pipelineError) {
      console.error(`[Analysis ${analysisId}] Pipeline error:`, pipelineError);
      
      await db.run(
        `UPDATE analysis_runs 
         SET status = 'failed', error_message = ?, completed_at = datetime('now') 
         WHERE id = ?`,
        pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
        analysisId
      );

      throw pipelineError;
    }
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const analysisId = searchParams.get("analysisId");
    const datasetId = searchParams.get("datasetId");

    const db = await getDB();

    if (analysisId) {
      const analysis = await db.get(
        "SELECT * FROM analysis_runs WHERE id = ?",
        parseInt(analysisId)
      );

      if (!analysis) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
      }

      return NextResponse.json({
        ...analysis,
        kpi_result: analysis.kpi_result ? JSON.parse(analysis.kpi_result) : null,
        signal_result: analysis.signal_result ? JSON.parse(analysis.signal_result) : null,
        driver_result: analysis.driver_result ? JSON.parse(analysis.driver_result) : null,
        evidence_result: analysis.evidence_result ? JSON.parse(analysis.evidence_result) : null,
        filters: analysis.filters ? JSON.parse(analysis.filters) : null,
      });
    }

    if (datasetId) {
      const analyses = await db.all(
        "SELECT * FROM analysis_runs WHERE dataset_id = ? ORDER BY created_at DESC",
        parseInt(datasetId)
      );

      return NextResponse.json(
        analyses.map((a: any) => ({
          ...a,
          kpi_result: a.kpi_result ? JSON.parse(a.kpi_result) : null,
          signal_result: a.signal_result ? JSON.parse(a.signal_result) : null,
          driver_result: a.driver_result ? JSON.parse(a.driver_result) : null,
          evidence_result: a.evidence_result ? JSON.parse(a.evidence_result) : null,
          filters: a.filters ? JSON.parse(a.filters) : null,
        }))
      );
    }

    return NextResponse.json(
      { error: "analysisId or datasetId is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Analyze GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analysis" },
      { status: 500 }
    );
  }
}