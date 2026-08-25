// src/server/rag/documents.ts
// Loads the unstructured business document corpus (reviews, tickets, reports,
// manager notes) that the RAG pipeline indexes and retrieves from.
import { readJSON } from "../utils";
import type { EvidenceItem } from "../types";

let cache: EvidenceItem[] | null = null;

export async function loadDocuments(): Promise<EvidenceItem[]> {
  if (cache) return cache;
  cache = await readJSON<EvidenceItem[]>("evidence.json");
  return cache;
}

/** Test-only / dev hook: force a reload next time loadDocuments() is called. */
export function invalidateDocumentCache(): void {
  cache = null;
}
