import { NextResponse } from "next/server";
import { computeKPI } from "@/server/kpi";
import { normalizeMetric } from "@/server/kpi/definitions";
import { validateMonth } from "@/server/utils/dateUtils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const month = searchParams.get("month");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  if (!month) {
    return NextResponse.json({ error: "Missing required query param: month" }, { status: 400 });
  }

  if (!validateMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM with month 01-12" }, { status: 400 });
  }

  try {
    const result = await computeKPI(metric, month, { region, product, channel });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}