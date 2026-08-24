// src/server/evidence/index.ts
import { readJSON } from "../utils";
import type { EvidenceItem } from "../types";

/** Simple random embedding generator for prototype */
function randomVector(dim = 128): number[] {
  return Array.from({ length: dim }, () => Math.random());
}

/** Compute cosine similarity between two vectors */
function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

let embeddingCache: Record<number, number[]> = {};

/** Load evidence JSON and lazily compute embeddings */
export async function loadEvidence(): Promise<EvidenceItem[]> {
  const data = await readJSON<EvidenceItem[]>("evidence.json");
  // Ensure each item has an embedding (computed once)
  data.forEach((item) => {
    if (!embeddingCache[item.id]) {
      embeddingCache[item.id] = randomVector();
    }
    (item as any).embedding = embeddingCache[item.id];
  });
  return data;
}

/**
 * Retrieve top‑N evidence items most similar to a KPI signal representation.
 * For the prototype we convert the KPI numeric value into a simple vector.
 */
export async function searchEvidence(kpiSignal: number, topN = 10): Promise<EvidenceItem[]> {
  const evidence = await loadEvidence();
  // Convert KPI signal to a 128‑dim pseudo‑vector (repeated value normalized)
  const signalVec = Array(128).fill(kpiSignal / 1e5); // scale down
  const scored = evidence.map((item) => ({
    item,
    score: cosine((item as any).embedding, signalVec),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.item);
}
