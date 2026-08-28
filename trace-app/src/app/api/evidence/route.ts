// src/app/api/evidence/route.ts
import { NextResponse } from "next/server";
import { analyzeEvidence, initializeModule4 } from "@/server/evidence";

export async function GET(request: Request) {
  try {
    await initializeModule4();
    
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric") ?? searchParams.get("kpi") ?? "revenue";
    const period = searchParams.get("period") ?? searchParams.get("month");
    const driver = searchParams.get("driver");
    const region = searchParams.get("region");
    const product = searchParams.get("product");
    const channel = searchParams.get("channel");
    const dateStart = searchParams.get("dateStart");
    const dateEnd = searchParams.get("dateEnd");
    const expectedDirection = searchParams.get("expectedDirection") as "positive" | "negative" | undefined;
    const priorConfidence = parseFloat(searchParams.get("priorConfidence") || "0.5");
    const expectedDirectionParam = expectedDirection ?? "negative";
    
    if (!period) {
      return NextResponse.json({ error: "Missing period" }, { status: 400 });
    }

    const analysisId = `anl-${Date.now()}`;
    
    const filters: Record<string, string | undefined> = {};
    if (region) filters.region = region;
    if (product) filters.product = product;
    if (channel) filters.channel = channel;
    if (dateStart) filters.dateStart = dateStart;
    if (dateEnd) filters.dateEnd = dateEnd;

    const evidenceRequests = [{
      hypothesisId: `H1-${driver || "unknown"}`,
      metric,
      period,
      driver: driver || "unknown",
      query: `${driver || metric} ${period}`,
      filters,
      requiredEvidence: []
    }];

    const m3Hypotheses = [{
      hypothesisId: `H1-${driver || "unknown"}`,
      driver: driver || "unknown",
      name: driver || metric,
      expectedDirection: expectedDirectionParam,
      priorConfidence,
    }];

    try {
      const result = await analyzeEvidence({
        analysisId,
        evidenceRequests,
        m3Hypotheses,
      });

      return NextResponse.json({
        evidencePackage: result.evidencePackage,
        graphData: result.graphData,
        telemetry: result.telemetry,
        confidenceUpdates: result.confidenceUpdates,
        provenanceSummary: result.provenanceSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error("[/api/evidence] failed:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}