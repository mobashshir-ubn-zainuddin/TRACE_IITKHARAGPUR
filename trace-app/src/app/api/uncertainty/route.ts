// src/app/api/uncertainty/route.ts
import { NextResponse } from "next/server";
import { investigate } from "@/server/investigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") ?? "revenue";
  const month = searchParams.get("month");
  const region = searchParams.get("region") || undefined;
  const product = searchParams.get("product") || undefined;
  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }
  try {
    const { uncertainty } = await investigate(metric, month, { region, product });
    return NextResponse.json(uncertainty);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
