/**
 * Module 4: Embeddings - Main Export
 */

export type { EmbeddingProvider } from "./provider";
export { EmbeddingService, getEmbeddingService, resetEmbeddingService, createDefaultProvider, DeterministicEmbeddingProvider, GeminiEmbeddingProvider } from "./provider";
export type { CacheEntry, EmbeddingProviderConfig, EmbeddingProviderType } from "./provider";