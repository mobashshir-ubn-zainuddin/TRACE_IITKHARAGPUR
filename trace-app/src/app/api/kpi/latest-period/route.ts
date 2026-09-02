import { NextResponse } from "next/server";
import { getLatestAvailablePeriod } from "@/server/kpi";
import { normalizeMetric } from "@/server/kpi/definitions";
import { prevMonth } from "@/server/utils/dateUtils";

/**
 * The single authoritative "what period should the app be looking at right
 * now" endpoint. Every client that needs a default analysis period (the
 * dashboard, the upload -> analyze flow) should call this instead of
 * deriving one from the system clock, so the whole app shares one
 * data-aware current period instead of each screen guessing independently.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric") ?? "revenue";
  const metric = normalizeMetric(rawMetric);
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  const channel = searchParams.get("channel") || undefined;

  try {
    const period = await getLatestAvailablePeriod(metric, { region, product, channel });
    return NextResponse.json({
      metric,
      period,
      previousPeriod: period ? prevMonth(period) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
