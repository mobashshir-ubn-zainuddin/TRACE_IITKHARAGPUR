import { NextResponse } from "next/server";
import { getKPIBreakdown } from "@/server/kpi";
import { getKPIDefinition, normalizeMetric } from "@/server/kpi/definitions";
import { validateMonth } from "@/server/utils/dateUtils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const month = searchParams.get("month");
  const dimension = searchParams.get("dimension") ?? "region";
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;

  if (!month) {
    return NextResponse.json({ error: "Missing required query param: month" }, { status: 400 });
  }

  if (!validateMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM with month 01-12" }, { status: 400 });
  }

  const def = getKPIDefinition(metric);
  if (!def) {
    return NextResponse.json({ error: `Unknown metric: ${rawMetric}` }, { status: 400 });
  }

  try {
    const breakdown = await getKPIBreakdown(metric, month, dimension, { region, product });
    return NextResponse.json({
      metric,
      label: def?.label ?? metric,
      period: month,
      dimension,
      breakdown
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported dimension") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}