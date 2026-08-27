import { NextResponse } from "next/server";
import { calculateDimensionContribution } from "@/server/driver/contribution";
import { normalizeMetric } from "@/server/kpi/definitions";
import { driverSupportsDimension, type BreakdownDimension } from "@/server/driver/history";

const DIMENSIONS: BreakdownDimension[] = ["region", "product", "channel", "campaign"];

/**
 * Dimension support is derived from the source table's actual grain rather than
 * a hardcoded metric list. marketing_daily now carries channel and campaign, so
 * conversion/marketingROI breakdowns along those dimensions are real queries,
 * not 400s.
 */
function supportedDimensionsFor(metric: string): BreakdownDimension[] {
  return DIMENSIONS.filter((d) => driverSupportsDimension(normalizeMetric(metric), d));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const period = searchParams.get("period");
  const dimension = searchParams.get("dimension") as BreakdownDimension;
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  if (!period) {
    return NextResponse.json({ error: "Missing required query param: period" }, { status: 400 });
  }

  if (!dimension || !DIMENSIONS.includes(dimension)) {
    return NextResponse.json(
      { error: `Missing or invalid dimension. Must be one of: ${DIMENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const metric = normalizeMetric(rawMetric);
  const supported = supportedDimensionsFor(metric);

  if (!supported.includes(dimension)) {
    return NextResponse.json(
      { error: `Dimension '${dimension}' not supported for metric '${metric}'. Supported: ${supported.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const contributions = await calculateDimensionContribution(metric, period, dimension, { region, product, channel });
    
    return NextResponse.json({
      metric,
      period,
      dimension,
      supportedDimensions: supported,
      contributions: contributions.map(c => ({
        name: c.dimensionValue,
        change: c.change,
        changePct: c.changePct,
        // Two distinct quantities -- see types.ts. Do not render signed as a share.
        contributionPct: c.contributionPct,
        signedContributionPct: c.signedContributionPct,
        magnitudeContributionPct: c.magnitudeContributionPct,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}