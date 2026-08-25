import { NextResponse } from "next/server";
import { getKPIHistory } from "@/server/kpi";
import { getKPIDefinition } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const start = searchParams.get("start") || undefined;
  const end = searchParams.get("end") || undefined;

  try {
    const history = await getKPIHistory(metric, { region, product, start, end });
    const def = getKPIDefinition(metric);
    return NextResponse.json({
      metric,
      label: def?.label ?? metric,
      unit: def?.unit ?? "",
      periods: history
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}