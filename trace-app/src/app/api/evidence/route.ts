// src/app/api/evidence/route.ts
import { NextResponse } from "next/server";
import { retrieveEvidence, generateInvestigationQuestions } from "@/server/rag";
import { getSignal } from "@/server/signal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kpi = searchParams.get("kpi") ?? "revenue";
  const month = searchParams.get("month");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const topK = Number(searchParams.get("topK") ?? "20");

  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }

  try {
    const signal = await getSignal(kpi, month, { region, product });
    const questions = generateInvestigationQuestions(signal.label, signal.change_pct < 0 ? "down" : "up");
    const query = questions.join(" ");
    const hits = await retrieveEvidence(query, {
      region,
      dateFrom: month,
      dateTo: month,
      topK,
      minScore: 0.03,
    });
    // Kept as a bare array (not wrapped) for backward compatibility with existing
    // consumers (e.g. the Evidence Graph view) that expect EvidenceItem[].
    const evidence = hits.map((h) => ({ ...h.item, relevance: Math.round(h.score * 1000) / 1000 }));
    return NextResponse.json(evidence, { headers: { "X-Investigation-Query": query, "X-Anomaly": String(signal.is_anomaly) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
