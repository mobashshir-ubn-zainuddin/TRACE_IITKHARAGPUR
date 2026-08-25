import { NextResponse } from "next/server";
import { getKPIHistory } from "@/server/kpi";
import { getKPIDefinition, normalizeMetric } from "@/server/kpi/definitions";

function validateMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const start = searchParams.get("start") || undefined;
  const end = searchParams.get("end") || undefined;

  const def = getKPIDefinition(metric);
  if (!def) {
    return NextResponse.json({ error: `Unknown metric: ${rawMetric}` }, { status: 400 });
  }

  if (start && !validateMonth(start)) {
    return NextResponse.json({ error: "Invalid start month format. Use YYYY-MM" }, { status: 400 });
  }
  if (end && !validateMonth(end)) {
    return NextResponse.json({ error: "Invalid end month format. Use YYYY-MM" }, { status: 400 });
  }

  try {
    const history = await getKPIHistory(metric, { region, product, start, end });
    return NextResponse.json({
      metric,
      label: def?.label ?? metric,
      unit: def?.unit ?? "",
      periods: history
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}