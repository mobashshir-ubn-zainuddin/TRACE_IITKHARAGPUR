import { NextResponse } from "next/server";
import { generateHypotheses } from "@/server/driver/hypothesis";
import { normalizeMetric } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const period = searchParams.get("period");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  if (!period) {
    return NextResponse.json({ error: "Missing required query param: period" }, { status: 400 });
  }

  try {
    const metric = normalizeMetric(rawMetric);
    const hypotheses = await generateHypotheses(metric, period, { region, product, channel });
    
    return NextResponse.json({
      metric,
      period,
      hypotheses: hypotheses.map((h) => ({
        id: h.id,
        name: h.name,
        description: h.description,
        driver: h.driver,
        claim: h.claim,
        expectedDirection: h.expectedDirection,
        scope: h.scope,
        contributionPct: h.contributionPct,
        signedContributionPct: h.signedContributionPct,
        magnitudeContributionPct: h.magnitudeContributionPct,
        associationScore: h.associationScore,
        pValue: h.pValue,
        isStatisticallySignificant: h.isStatisticallySignificant,
        sampleSize: h.sampleSize,
        temporalAlignment: h.temporalAlignment,
        bestLag: h.bestLag,
        lagDirection: h.lagDirection,
        segmentConsistency: h.segmentConsistency,
        causalPlausibility: h.causalPlausibility,
        evidenceAvailability: h.evidenceAvailability,
        evidenceDetail: h.evidenceDetail,
        score: h.score,
        confidence: h.confidence,
        status: h.status,
        caveats: h.caveats,
        contradictions: h.contradictions,
        scoreBreakdown: h.scoreBreakdown,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}