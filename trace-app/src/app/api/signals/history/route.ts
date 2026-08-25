import { NextResponse } from "next/server";
import { getSignalHistory } from "@/server/signal";
import { normalizeMetric } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const start = searchParams.get("start") || undefined;
  const end = searchParams.get("end") || undefined;

  try {
    const history = await getSignalHistory(metric, { region, product, start, end });
    return NextResponse.json({ metric, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}