// src/app/api/investigate/route.ts
// Single combined "why did this happen" payload: signal + hypotheses +
// uncertainty + top supporting evidence. Intended for the Investigate view
// so it doesn't need four separate round trips that could disagree with
// each other.
import { NextResponse } from "next/server";
import { investigate } from "@/server/investigation";

function validateMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;

  if (!month) {
    return NextResponse.json({ error: "Missing required query param: month" }, { status: 400 });
  }
  if (!validateMonth(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 });
  }

  try {
    const result = await investigate(metric, month, { region, product });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.startsWith("Unknown region") || message.startsWith("Unknown product") || message.startsWith("Unsupported metric") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
