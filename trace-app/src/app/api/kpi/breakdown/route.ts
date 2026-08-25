import { NextResponse } from "next/server";
import { getKPIBreakdown } from "@/server/kpi";
import { getKPIDefinition } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");
  const dimension = searchParams.get("dimension") ?? "region";
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;

  if (!month) {
    return NextResponse.json({ error: "Missing required query param: month" }, { status: 400 });
  }

  try {
    const breakdown = await getKPIBreakdown(metric, month, dimension, { region, product });
    const def = getKPIDefinition(metric);
    return NextResponse.json({
      metric,
      label: def?.label ?? metric,
      period: month,
      dimension,
      breakdown
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}