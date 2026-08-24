// src/app/api/decisions/route.ts
import { NextResponse } from "next/server";
import { getDecisions, addDecision } from "@/server/decision";

export async function GET() {
  try {
    const decisions = await getDecisions();
    return NextResponse.json(decisions);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Expect { kpi, action, timestamp }
    if (!body.kpi || !body.action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const decision = {
      kpi: body.kpi,
      action: body.action,
      timestamp: body.timestamp ?? new Date().toISOString(),
    };
    await addDecision(decision);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 });
  }
}
