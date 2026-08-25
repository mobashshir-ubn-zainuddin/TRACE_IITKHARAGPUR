// src/server/rag/retrieve.ts
// Retrieval half of the RAG pipeline: given a natural-language investigation
// question, return the most relevant unstructured documents with their real
// similarity score and full source metadata (never raw, unattributed text).
import { loadDocuments } from "./documents";
import { buildIndex, vectorizeQuery, cosineSimilarity } from "./tfidf";
import type { EvidenceItem } from "../types";

export interface RetrievalOptions {
  topK?: number;
  region?: string;
  dateFrom?: string; // inclusive, YYYY-MM-DD or YYYY-MM
  dateTo?: string; // inclusive
  topics?: string[];
  minScore?: number;
}

export interface RetrievedDoc {
  item: EvidenceItem;
  score: number;
}

/** Normalize a YYYY-MM bound to a full YYYY-MM-DD bound for lexical comparison. */
function normalizeFrom(bound?: string): string | undefined {
  if (!bound) return undefined;
  return bound.length === 7 ? `${bound}-01` : bound;
}
function normalizeTo(bound?: string): string | undefined {
  if (!bound) return undefined;
  return bound.length === 7 ? `${bound}-31` : bound; // "31" is only a lexical upper bound, not a real date
}

function inRange(date: string, from?: string, to?: string): boolean {
  const f = normalizeFrom(from);
  const t = normalizeTo(to);
  if (f && date < f) return false;
  if (t && date > t) return false;
  return true;
}

export async function retrieveEvidence(query: string, opts: RetrievalOptions = {}): Promise<RetrievedDoc[]> {
  const { topK = 10, region, dateFrom, dateTo, topics, minScore = 0.05 } = opts;
  const all = await loadDocuments();

  const scoped = all.filter((d) => {
    if (region && d.region !== region) return false;
    if (topics && topics.length > 0 && !topics.includes(d.topic)) return false;
    if ((dateFrom || dateTo) && !inRange(d.date, dateFrom, dateTo)) return false;
    return true;
  });

  // No fallback to the unfiltered corpus: if a region/month genuinely has no
  // matching documents, that absence of evidence is itself meaningful and
  // should surface as "no evidence found," not evidence borrowed from
  // somewhere else that doesn't actually apply.
  if (scoped.length === 0) return [];
  const pool = scoped;

  const index = buildIndex(pool.map((d) => d.text));
  const queryVec = vectorizeQuery(query, index.idf);

  const scored = pool.map((item, i) => ({ item, score: cosineSimilarity(queryVec, index.docVectors[i]) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.filter((s) => s.score >= minScore).slice(0, topK);
}
