/**
 * Module 4: Embedding Provider
 * 
 * Abstract interface for embedding generation with support for multiple providers.
 * Primary: Google Gemini API (gemini-embedding-001)
 * Fallback: Local deterministic embeddings
 */

import { getDB } from "../../db";
import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";

interface EmbeddingProvider {
  /** Provider name for identification */
  readonly name: string;
  /** Embedding model name */
  readonly model: string;
  /** Embedding dimension */
  readonly dimension: number;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

type EmbeddingProviderType = "gemini" | "deterministic";

interface EmbeddingProviderConfig {
  type: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
  dimension?: number;
}

interface CacheEntry {
  contentHash: string;
  embedding: number[];
  model: string;
  provider: string;
  dimension: number;
  createdAt: string;
}

/** Generate canonical SHA-256 content hash */
function generateContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Simple deterministic embedding using text hashing (fallback when no model available) */
class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic";
  readonly model = "deterministic-hash";
  readonly dimension: number;

  constructor(dimension: number = 768) {
    this.dimension = dimension;
  }

  private textToVector(text: string, dim: number): number[] {
    // Create a deterministic but distributed vector from text
    const vector = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
    
    for (const word of words) {
      // Simple hash of word
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash;
      }
      
      // Distribute across dimensions
      const startIdx = Math.abs(hash) % dim;
      for (let i = 0; i < Math.min(word.length, 8); i++) {
        const idx = (startIdx + i) % dim;
        vector[idx] += Math.sin(hash + i) * 0.1;
      }
    }
    
    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vector.map(v => v / norm) : vector;
  }

  async embed(text: string): Promise<number[]> {
    return this.textToVector(text, this.dimension);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

/** Google Gemini Embedding Provider (Primary) */
class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly model = "gemini-embedding-001";
  private client: GoogleGenAI;
  private outputDimension: number;

  constructor(config: { apiKey: string; dimension?: number }) {
    if (!config.apiKey) {
      throw new Error("GEMINI_API_KEY is required for GeminiEmbeddingProvider");
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.outputDimension = config.dimension || 768;
  }

  get dimension(): number {
    return this.outputDimension;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.client.models.embedContent({
      model: this.model,
      contents: text,
      config: { outputDimensionality: this.outputDimension },
    });
    
    const embedding = result.embeddings?.[0]?.values;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Failed to generate embedding from Gemini API");
    }
    
    // Validate dimension
    if (embedding.length !== this.outputDimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this.outputDimension}, got ${embedding.length}`);
    }
    
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process in batches to avoid rate limits
    const batchSize = 100;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const result = await this.client.models.embedContent({
        model: this.model,
        contents: batch,
        config: { outputDimensionality: this.outputDimension },
      });
      
      const embeddings = result.embeddings?.map(e => e.values).filter((e): e is number[] => Array.isArray(e) && e.length === this.outputDimension);
      if (!embeddings || embeddings.length === 0) {
        throw new Error("Failed to generate batch embeddings from Gemini API");
      }
      
      results.push(...embeddings);
    }
    
    return results;
  }
}

/** Embedding service with caching and persistence */
class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache: Map<string, CacheEntry> = new Map();
  private modelName: string;
  private providerName: string;
  private dimension: number;
  private initPromise: Promise<void> | null = null;
  // Circuit breaker: once the configured provider fails once (e.g. an
  // invalid API key), it will fail identically on every subsequent call for
  // the lifetime of this process - there is no point re-attempting it (and
  // paying its network latency) for every single chunk/query. Trip once,
  // warn once, and route everything else straight to the deterministic
  // fallback until the process restarts (or resetEmbeddingService() runs).
  private providerDisabled = false;
  private providerFailureWarned = false;

  constructor(provider?: EmbeddingProvider) {
    // Use Gemini if available, otherwise deterministic
    this.provider = provider || createDefaultProvider();
    this.providerName = this.provider.name;
    this.modelName = this.provider.model;
    this.dimension = this.provider.dimension;
    this.initPromise = this.loadCache();
  }

  /** Get the active embedding provider name */
  getProviderName(): string {
    return this.providerName;
  }

  /** Get the active embedding model name */
  getModelName(): string {
    return this.modelName;
  }

  /** Get the active embedding dimension */
  getDimension(): number {
    return this.dimension;
  }

  /** Ensure initialization is complete */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /** Load cache from database */
  private async loadCache(): Promise<void> {
    try {
      const db = await getDB();
      const rows = await db.all(`
        SELECT content_hash, embedding, model, provider, dimension, created_at 
        FROM embeddings 
        WHERE provider = ? AND model = ? AND dimension = ?
      `, this.providerName, this.modelName, this.dimension);
      
      for (const row of rows) {
        const cacheKey = this.cacheKey(row.content_hash);
        this.cache.set(cacheKey, {
          contentHash: row.content_hash,
          embedding: JSON.parse(row.embedding),
          model: row.model,
          provider: row.provider,
          dimension: row.dimension,
          createdAt: row.created_at,
        });
      }
      console.log(`Loaded ${this.cache.size} cached embeddings for ${this.providerName}/${this.modelName} (dim=${this.dimension})`);
    } catch (error) {
      console.warn("Could not load embedding cache:", error);
    }
  }

  /** Generate cache key with provider/model/dimension separation */
  private cacheKey(contentHash: string): string {
    return `${this.providerName}:${this.modelName}:${this.dimension}:${contentHash}`;
  }

  /** Log the provider failure exactly once, with just the message (not the
   *  full stack trace repeated per call) - one concise warning instead of
   *  dozens of identical ones. Genuine, unexpected errors are still logged;
   *  this only suppresses repeats of the SAME already-diagnosed failure. */
  private reportProviderFailure(error: unknown): void {
    this.providerDisabled = true;
    if (this.providerFailureWarned) return;
    this.providerFailureWarned = true;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Embedding provider "${this.provider.name}" failed (${reason}). Falling back to deterministic embeddings for the rest of this session; further attempts against this provider are suppressed to avoid repeated failing API calls.`
    );
  }

  private async embedWithFallback(text: string): Promise<number[]> {
    if (!this.providerDisabled) {
      try {
        return await this.provider.embed(text);
      } catch (error) {
        this.reportProviderFailure(error);
      }
    }
    return new DeterministicEmbeddingProvider(this.dimension).embed(text);
  }

  private async embedBatchWithFallback(texts: string[]): Promise<{ embeddings: number[][]; fallbackUsed: boolean }> {
    if (!this.providerDisabled) {
      try {
        return { embeddings: await this.provider.embedBatch(texts), fallbackUsed: false };
      } catch (error) {
        this.reportProviderFailure(error);
      }
    }
    return { embeddings: await new DeterministicEmbeddingProvider(this.dimension).embedBatch(texts), fallbackUsed: true };
  }

  /** Get embedding for query text (NOT persisted to database) */
  async embedQuery(text: string): Promise<{ embedding: number[]; fromCache: boolean; latencyMs: number; fallbackUsed?: boolean }> {
    await this.ensureInitialized();
    const startTime = Date.now();
    const contentHash = generateContentHash(text);
    const cacheKey = this.cacheKey(contentHash);
    
    // Check memory cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        embedding: cached.embedding,
        fromCache: true,
        latencyMs: Date.now() - startTime,
      };
    }
    
    // Generate embedding with fallback to deterministic (circuit-broken -
    // see embedWithFallback())
    const embedding = await this.embedWithFallback(text);

    // Validate dimension
    if (embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
    }
    
    // Store in memory cache with provider-specific key
    this.cache.set(cacheKey, {
      contentHash,
      embedding,
      model: this.modelName,
      provider: this.providerName,
      dimension: this.dimension,
      createdAt: new Date().toISOString(),
    });
    
    // Query embeddings are NOT persisted to database
    return { embedding, fromCache: false, latencyMs: Date.now() - startTime };
  }

  /** Get embedding for document chunk (persisted to database) */
  async embedChunk(chunkId: number, text: string): Promise<{ embedding: number[]; fromCache: boolean; latencyMs: number; fallbackUsed?: boolean }> {
    await this.ensureInitialized();
    const startTime = Date.now();
    const contentHash = generateContentHash(text);
    const cacheKey = this.cacheKey(contentHash);
    
    // Check memory cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        embedding: cached.embedding,
        fromCache: true,
        latencyMs: Date.now() - startTime,
      };
    }
    
    // Generate embedding with fallback to deterministic (circuit-broken -
    // see embedWithFallback())
    const embedding = await this.embedWithFallback(text);

    // Validate dimension
    if (embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
    }
    
    // Store in memory cache
    this.cache.set(cacheKey, {
      contentHash,
      embedding,
      model: this.modelName,
      provider: this.providerName,
      dimension: this.dimension,
      createdAt: new Date().toISOString(),
    });
    
    // Persist to database with actual chunk_id
    await this.persistEmbedding(chunkId, contentHash, embedding);
    
    return { embedding, fromCache: false, latencyMs: Date.now() - startTime };
  }

  /** Batch embed for query texts (NOT persisted) */
  async embedQueryBatch(texts: string[]): Promise<{ embeddings: number[][]; fromCache: boolean[]; latencyMs: number; fallbackUsed?: boolean }> {
    await this.ensureInitialized();
    const startTime = Date.now();
    const hashes = texts.map(t => generateContentHash(t));
    const cacheKeys = hashes.map(h => this.cacheKey(h));
    const results: number[][] = [];
    const fromCache: boolean[] = [];
    const toGenerate: { index: number; text: string }[] = [];
    let fallbackUsed = false;
    
    // Check cache for all
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(cacheKeys[i]);
      if (cached) {
        results[i] = cached.embedding;
        fromCache[i] = true;
      } else {
        toGenerate.push({ index: i, text: texts[i] });
        fromCache[i] = false;
      }
    }
    
    // Generate missing embeddings
    if (toGenerate.length > 0) {
      // Circuit-broken - see embedBatchWithFallback()
      const result = await this.embedBatchWithFallback(toGenerate.map(t => t.text));
      const generated = result.embeddings;
      fallbackUsed = result.fallbackUsed;
      for (let j = 0; j < toGenerate.length; j++) {
        const { index } = toGenerate[j];
        results[index] = generated[j];
        const hash = hashes[index];
        const cacheKey = this.cacheKey(hash);
        this.cache.set(cacheKey, {
          contentHash: hash,
          embedding: generated[j],
          model: this.modelName,
          provider: this.providerName,
          dimension: this.dimension,
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    return {
      embeddings: results,
      fromCache,
      latencyMs: Date.now() - startTime,
      fallbackUsed,
    };
  }

  /** Batch embed for document chunks (persisted) */
  async embedChunkBatch(chunkIds: number[], texts: string[]): Promise<{ embeddings: number[][]; fromCache: boolean[]; latencyMs: number; fallbackUsed?: boolean }> {
    await this.ensureInitialized();
    const startTime = Date.now();
    const hashes = texts.map(t => generateContentHash(t));
    const cacheKeys = hashes.map(h => this.cacheKey(h));
    const results: number[][] = [];
    const fromCache: boolean[] = [];
    const toGenerate: { index: number; chunkId: number; text: string }[] = [];
    let fallbackUsed = false;
    
    // Check cache for all
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(cacheKeys[i]);
      if (cached) {
        results[i] = cached.embedding;
        fromCache[i] = true;
      } else {
        toGenerate.push({ index: i, chunkId: chunkIds[i], text: texts[i] });
        fromCache[i] = false;
      }
    }
    
    // Generate missing embeddings
    if (toGenerate.length > 0) {
      // Circuit-broken - see embedBatchWithFallback()
      const result = await this.embedBatchWithFallback(toGenerate.map(t => t.text));
      const generated = result.embeddings;
      fallbackUsed = result.fallbackUsed;
      for (let j = 0; j < toGenerate.length; j++) {
        const { index, chunkId } = toGenerate[j];
        results[index] = generated[j];
        const hash = hashes[index];
        const cacheKey = this.cacheKey(hash);
        this.cache.set(cacheKey, {
          contentHash: hash,
          embedding: generated[j],
          model: this.modelName,
          provider: this.providerName,
          dimension: this.dimension,
          createdAt: new Date().toISOString(),
        });
        // Persist with actual chunk_id
        await this.persistEmbedding(chunkId, hash, generated[j]);
      }
    }
    
    return {
      embeddings: results,
      fromCache,
      latencyMs: Date.now() - startTime,
      fallbackUsed,
    };
  }

  /** Persist embedding to database with proper chunk_id */
  private async persistEmbedding(chunkId: number, contentHash: string, embedding: number[]): Promise<void> {
    const db = await getDB();
    // Use UPSERT with unique constraint on (chunk_id, provider, model, dimension)
    await db.run(`
      INSERT INTO embeddings (chunk_id, embedding, provider, model, dimension, content_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(chunk_id, provider, model, dimension) DO UPDATE SET
        embedding = excluded.embedding,
        content_hash = excluded.content_hash,
        created_at = excluded.created_at
    `, chunkId, JSON.stringify(embedding), this.providerName, this.modelName, this.dimension, contentHash);
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; provider: string; model: string; dimension: number } {
    return {
      size: this.cache.size,
      provider: this.providerName,
      model: this.modelName,
      dimension: this.dimension,
    };
  }

  /** Clear cache */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let embeddingServiceInstance: EmbeddingService | null = null;

/** Get or create the default embedding service */
function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

/** Reset the embedding service (for testing or config changes) */
function resetEmbeddingService(): void {
  embeddingServiceInstance = null;
}

/** Create default provider based on environment configuration */
function createDefaultProvider(): EmbeddingProvider {
  const providerType = (process.env.EMBEDDING_PROVIDER as EmbeddingProviderType) || (process.env.GEMINI_API_KEY ? "gemini" : "deterministic");
  
  switch (providerType) {
    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set, falling back to deterministic provider");
        return new DeterministicEmbeddingProvider(768);
      }
      const dimension = parseInt(process.env.GEMINI_EMBEDDING_DIMENSION || "768", 10);
      return new GeminiEmbeddingProvider({ apiKey: process.env.GEMINI_API_KEY!, dimension });
    
    default:
      return new DeterministicEmbeddingProvider(768);
  }
}

export type { EmbeddingProvider, CacheEntry, EmbeddingProviderConfig, EmbeddingProviderType };
export { DeterministicEmbeddingProvider, GeminiEmbeddingProvider, EmbeddingService, getEmbeddingService, resetEmbeddingService, createDefaultProvider, generateContentHash };