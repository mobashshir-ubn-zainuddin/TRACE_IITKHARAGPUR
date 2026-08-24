// src/server/uncertainty/index.ts
import { readJSON } from "../utils";
import type { EvidenceItem } from "../types";

/**
 * Simple uncertainty detection: if less than a threshold of evidence items are found for a KPI, report higher uncertainty.
 */
export async function computeUncertainty(metric: string, month: string, minEvidence = 5): Promise<{ metric: string; month: string; uncertainty_pct: number }> {
  // Load evidence and filter by month (using date field)
  const evidence = await readJSON<EvidenceItem[]>("evidence.json");
  const monthPrefix = month; // expecting YYYY-MM
  const monthEvidence = evidence.filter((e) => e.date.startsWith(monthPrefix));
  const count = monthEvidence.length;
  const uncertainty = count < minEvidence ? 100 - (count / minEvidence) * 100 : 0;
  return { metric, month, uncertainty_pct: Math.round(uncertainty) };
}
