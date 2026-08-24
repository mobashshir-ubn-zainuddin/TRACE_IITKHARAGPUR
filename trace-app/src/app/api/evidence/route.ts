// src/app/api/evidence/route.ts
import { NextResponse } from "next/server";
import { searchEvidence } from "@/server/evidence";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kpi = searchParams.get("kpi") ?? "revenue";
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }

  // Simple mapping: use KPI value as signal (fetch KPI first)
  const { computeKPI } = await import("@/server/kpi");
  const kpiResult = await computeKPI(kpi, month);
  const evidence = await searchEvidence(kpiResult.value);
  return NextResponse.json(evidence);
}
