// src/server/rag/tfidf.ts
// A small, dependency-free TF-IDF vector space model. No external embedding
// API is required, which keeps retrieval deterministic, offline, and free —
// important for a hackathon demo that can't depend on network/API keys.

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so", "of", "in", "on", "at", "to", "for",
  "with", "without", "by", "from", "up", "down", "into", "over", "under", "again", "further",
  "is", "am", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those",
  "it", "its", "as", "than", "too", "very", "can", "will", "just", "not", "no", "do", "does",
  "did", "has", "have", "had", "i", "my", "me", "we", "our", "you", "your", "he", "she", "they",
  "them", "their", "there", "here", "about", "after", "before", "during", "while", "each",
  "such", "only", "also", "more", "most", "some", "any", "all", "both", "same", "own",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface TfidfIndex {
  vocabulary: string[];
  idf: Map<string, number>;
  docVectors: Map<string, number>[]; // sparse term -> weight, aligned with docs order
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  // Log-normalized term frequency dampens the effect of repeated words in short documents.
  for (const [k, v] of tf) tf.set(k, 1 + Math.log(v));
  return tf;
}

export function buildIndex(documents: string[]): TfidfIndex {
  const tokenized = documents.map(tokenize);
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    const seen = new Set(tokens);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = documents.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((1 + n) / (1 + count)) + 1);
  }
  const docVectors = tokenized.map((tokens) => {
    const tf = termFrequencies(tokens);
    const vec = new Map<string, number>();
    for (const [term, freq] of tf) {
      vec.set(term, freq * (idf.get(term) ?? 0));
    }
    return vec;
  });
  return { vocabulary: [...df.keys()], idf, docVectors };
}

export function vectorizeQuery(query: string, idf: Map<string, number>): Map<string, number> {
  const tf = termFrequencies(tokenize(query));
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) {
    const w = idf.get(term);
    if (w) vec.set(term, freq * w);
  }
  return vec;
}

function norm(vec: Map<string, number>): number {
  let sum = 0;
  for (const v of vec.values()) sum += v * v;
  return Math.sqrt(sum);
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of smaller) {
    const other = larger.get(term);
    if (other) dot += weight * other;
  }
  const denom = norm(a) * norm(b);
  return denom > 0 ? dot / denom : 0;
}
