// src/server/decision/index.ts
import { getDecisions, addDecision } from "./sqlite";
export { getDecisions, addDecision };

import { readJSON, appendJSON } from "../utils";
import type { DecisionItem } from "../types";

/** Get all saved decisions */
export async function getDecisions(): Promise<DecisionItem[]> {
  return await readJSON<DecisionItem[]>("decisions.json");
}

/** Store a new decision */
export async function addDecision(decision: DecisionItem): Promise<void> {
  await appendJSON<DecisionItem>("decisions.json", decision);
}
