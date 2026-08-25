// src/app/api/uncertainty/route.ts
import { NextResponse } from "next/server";
import { computeUncertainty } from "@/server/uncertainty";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }
  try {
    const result = await computeUncertainty(metric, month);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
