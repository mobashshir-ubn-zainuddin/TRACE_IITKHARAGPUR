// src/app/api/hypotheses/route.ts
import { NextResponse } from "next/server";
import { scoreHypotheses } from "@/server/hypothesis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }
  try {
    const results = await scoreHypotheses(metric, month);
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
