import { NextResponse } from "next/server";
import { generateSignal } from "@/server/signal";
import { normalizeMetric } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const period = searchParams.get("period");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  if (!period) {
    return NextResponse.json({ error: "Missing required query param: period" }, { status: 400 });
  }

  try {
    const signal = await generateSignal(metric, period, { region, product, channel });
    return NextResponse.json(signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}