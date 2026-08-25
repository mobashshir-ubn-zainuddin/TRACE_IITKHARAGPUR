import { NextResponse } from "next/server";
import { computeDataQuality } from "@/server/kpi/quality";

export async function GET() {
  try {
    const quality = await computeDataQuality();
    return NextResponse.json(quality);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}