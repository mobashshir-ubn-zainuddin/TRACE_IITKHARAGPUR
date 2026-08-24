// src/server/decision/sqlite.ts
import { getDB } from "../db";
import type { DecisionItem } from "../types";

export async function getDecisions(): Promise<DecisionItem[]> {
  const db = await getDB();
  return db.all<DecisionItem[]>("SELECT id, kpi, action, timestamp FROM decisions ORDER BY timestamp DESC");
}

export async function addDecision(decision: DecisionItem): Promise<void> {
  const db = await getDB();
  await db.run(
    "INSERT INTO decisions (kpi, action, timestamp) VALUES (?, ?, ?)",
    decision.kpi,
    decision.action,
    decision.timestamp ?? new Date().toISOString()
  );
}
