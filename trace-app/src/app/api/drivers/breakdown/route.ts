import { NextResponse } from "next/server";
import { calculateDimensionContribution } from "@/server/driver/contribution";
import { normalizeMetric } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const period = searchParams.get("period");
  const dimension = searchParams.get("dimension") as "region" | "product" | "channel";
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  if (!period) {
    return NextResponse.json({ error: "Missing required query param: period" }, { status: 400 });
  }

  if (!dimension || !["region", "product", "channel"].includes(dimension)) {
    return NextResponse.json({ error: "Missing or invalid dimension. Must be: region, product, or channel" }, { status: 400 });
  }

  try {
    const metric = normalizeMetric(rawMetric);
    const contributions = await calculateDimensionContribution(metric, period, dimension, { region, product, channel });
    
    return NextResponse.json({
      metric,
      period,
      dimension,
      contributions: contributions.map(c => ({
        name: c.dimensionValue,
        change: c.change,
        changePct: c.changePct,
        contributionPct: c.contributionPct,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}