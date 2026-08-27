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

export interface EmbeddingProvider {
  /** Provider name for identification */
  readonly name: string;
  /** Embedding dimension */
  readonly dimension: number;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Provider types */
export type EmbeddingProviderType = "gemini" | "deterministic" | "transformers-local";

/** Configuration for embedding provider */
export interface EmbeddingProviderConfig {
  type: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
  dimension?: number;
}

/** Embedding cache entry */
export interface CacheEntry {
  contentHash: string;
  embedding: number[];
  model: string;
  dimension: number;
  createdAt: string;
}

/** Simple deterministic embedding using text hashing (fallback when no model available) */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic-hash";
  readonly dimension = 384;

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
export class GeminiEmbeddingProvider implements EmbeddingProvider {
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

/** Real local embedding provider using Transformers.js (when available) */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly name = "transformers-local";
  readonly dimension = 384; // all-MiniLM-L6-v2 dimension
  private pipeline: ((text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>) | null = null;
  private initPromise: Promise<void> | null = null;

  private async initialize(): Promise<void> {
    if (this.pipeline) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      try {
        // Dynamic import to avoid build issues if not installed
        const { pipeline } = await import("@xenova/transformers");
        this.pipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          quantized: true,
        }) as (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;
        console.log("Transformers.js embedding model loaded successfully");
      } catch (error) {
        console.warn("Transformers.js not available, falling back to deterministic embeddings:", error);
        this.pipeline = null;
      }
    })();
    
    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize();
    
    if (!this.pipeline) {
      // Fallback to deterministic
      const fallback = new DeterministicEmbeddingProvider();
      return fallback.embed(text);
    }
    
    const output = await this.pipeline(text, { pooling: "mean", normalize: true });
    return Array.from(output.data) as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize();
    
    if (!this.pipeline) {
      const fallback = new DeterministicEmbeddingProvider();
      return fallback.embedBatch(texts);
    }
    
    // Process in batches to avoid memory issues
    const batchSize = 8;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const outputs = await Promise.all(
        batch.map(text => this.pipeline!(text, { pooling: "mean", normalize: true }))
      );
      results.push(...outputs.map((o: { data: Float32Array }) => Array.from(o.data) as number[]));
    }
    
    return results;
  }
}

/** Embedding service with caching and persistence */
export class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache: Map<string, CacheEntry> = new Map();
  private modelName: string;
  private dimension: number;

  constructor(provider?: EmbeddingProvider) {
    // Use Gemini if available, otherwise transformers, otherwise deterministic
    this.provider = provider || createDefaultProvider();
    this.modelName = this.provider.name;
    this.dimension = this.provider.dimension;
    this.loadCache();
  }

  /** Load cache from database */
  private async loadCache(): Promise<void> {
    try {
      const db = await getDB();
      const rows = await db.all(`
        SELECT content_hash, embedding, model, dimension, created_at 
        FROM embeddings 
        WHERE model = ? AND dimension = ?
      `, this.modelName, this.dimension);
      
      for (const row of rows) {
        this.cache.set(row.content_hash, {
          contentHash: row.content_hash,
          embedding: JSON.parse(row.embedding),
          model: row.model,
          dimension: row.dimension,
          createdAt: row.created_at,
        });
      }
      console.log(`Loaded ${this.cache.size} cached embeddings for ${this.modelName}`);
    } catch (error) {
      console.warn("Could not load embedding cache:", error);
    }
  }

  /** Generate content hash for caching */
  private contentHash(text: string): string {
    // Use crypto for proper SHA-256 hash
    const hash = createHash("sha256").update(text, "utf8").digest("hex");
    return `${this.modelName}:${this.dimension}:${hash}`;
  }

  /** Get embedding with caching */
  async embed(text: string): Promise<{ embedding: number[]; fromCache: boolean; latencyMs: number }> {
    const startTime = Date.now();
    const hash = this.contentHash(text);
    
    // Check memory cache
    const cached = this.cache.get(hash);
    if (cached) {
      return {
        embedding: cached.embedding,
        fromCache: true,
        latencyMs: Date.now() - startTime,
      };
    }
    
    // Generate embedding
    const embedding = await this.provider.embed(text);
    
    // Validate dimension
    if (embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
    }
    
    // Store in memory cache
    this.cache.set(hash, {
      contentHash: hash,
      embedding,
      model: this.modelName,
      dimension: this.dimension,
      createdAt: new Date().toISOString(),
    });
    
    // Persist to database (async, don't await)
    this.persistEmbedding(hash, embedding).catch(console.error);
    
    return { embedding, fromCache: false, latencyMs: Date.now() - startTime };
  }

  /** Batch embed with caching */
  async embedBatch(texts: string[]): Promise<{ embeddings: number[][]; fromCache: boolean[]; latencyMs: number }> {
    const startTime = Date.now();
    const hashes = texts.map(t => this.contentHash(t));
    const results: number[][] = [];
    const fromCache: boolean[] = [];
    const toGenerate: { index: number; text: string }[] = [];
    
    // Check cache for all
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(hashes[i]);
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
      const generated = await this.provider.embedBatch(toGenerate.map(t => t.text));
      for (let j = 0; j < toGenerate.length; j++) {
        const { index } = toGenerate[j];
        results[index] = generated[j];
        const hash = hashes[index];
        this.cache.set(hash, {
          contentHash: hash,
          embedding: generated[j],
          model: this.modelName,
          dimension: this.dimension,
          createdAt: new Date().toISOString(),
        });
        // Persist async
        this.persistEmbedding(hash, generated[j]).catch(console.error);
      }
    }
    
    return {
      embeddings: results,
      fromCache,
      latencyMs: Date.now() - startTime,
    };
  }

  /** Persist embedding to database */
  private async persistEmbedding(contentHash: string, embedding: number[]): Promise<void> {
    const db = await getDB();
    await db.run(`
      INSERT OR REPLACE INTO embeddings (chunk_id, embedding, model, dimension, content_hash, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, 0, JSON.stringify(embedding), this.modelName, this.dimension, contentHash);
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; model: string; dimension: number } {
    return {
      size: this.cache.size,
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
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

/** Reset the embedding service (for testing or config changes) */
export function resetEmbeddingService(): void {
  embeddingServiceInstance = null;
}

/** Create default provider based on environment configuration */
export function createDefaultProvider(): EmbeddingProvider {
  const providerType = (process.env.EMBEDDING_PROVIDER as EmbeddingProviderType) || (process.env.GEMINI_API_KEY ? "gemini" : "deterministic");
  
  switch (providerType) {
    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set, falling back to deterministic provider");
        return new DeterministicEmbeddingProvider();
      }
      const dimension = parseInt(process.env.GEMINI_EMBEDDING_DIMENSION || "768", 10);
      return new GeminiEmbeddingProvider({ apiKey: process.env.GEMINI_API_KEY!, dimension });
    
    case "transformers-local":
      return new TransformersEmbeddingProvider();
    
    default:
      return new DeterministicEmbeddingProvider();
  }
}