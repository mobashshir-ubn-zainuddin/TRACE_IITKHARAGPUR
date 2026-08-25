// src/server/rag/index.ts
// Public surface of the RAG pipeline: documents -> chunks(none needed, docs
// are already short) -> TF-IDF vectors -> retrieval. Re-exports retrieval and
// adds investigation-question generation from a KPI signal.
export { retrieveEvidence } from "./retrieve";
export type { RetrievalOptions, RetrievedDoc } from "./retrieve";
export { loadDocuments } from "./documents";

/**
 * Turn a KPI anomaly into the generic set of investigation questions an
 * analyst would ask next. Hypothesis-specific queries live alongside each
 * hypothesis definition; these are the broad, KPI-level questions used for
 * a general evidence search (e.g. the standalone /api/evidence endpoint).
 */
export function generateInvestigationQuestions(kpiLabel: string, direction: "up" | "down"): string[] {
  const verb = direction === "down" ? "decline drop decrease" : "increase spike rise";
  return [
    `${kpiLabel} ${verb} reasons customer feedback`,
    `product availability stockout inventory unavailable`,
    `pricing discount promotion competitor`,
    `delivery shipping delay SLA`,
    `checkout conversion cart abandonment`,
    `customer satisfaction complaints support tickets`,
  ];
}
