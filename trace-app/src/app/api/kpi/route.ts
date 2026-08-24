// src/app/api/kpi/route.ts
import { NextResponse } from "next/server";
import { computeKPI } from "@/server/kpi"; // alias via tsconfig paths (or relative import)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");

  if (!month) {
    return NextResponse.json({ error: "Missing required query param: month" }, { status: 400 });
  }

  try {
    const result = await computeKPI(metric, month);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
