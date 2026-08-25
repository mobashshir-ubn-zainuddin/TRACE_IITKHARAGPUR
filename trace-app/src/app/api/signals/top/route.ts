import { NextResponse } from "next/server";
import { getTopSignals } from "@/server/signal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const limit = parseInt(searchParams.get("limit") ?? "10", 10);

  if (!period) {
    return NextResponse.json({ error: "Missing required query param: period" }, { status: 400 });
  }

  try {
    const signals = await getTopSignals(period, limit);
    return NextResponse.json({ signals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}