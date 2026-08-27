/**
 * Module 4: Direction Scoring & Classification
 * 
 * Classifies evidence as SUPPORT, CONTRADICT, or NEUTRAL relative to hypothesis.
 * For structured evidence, compares expected hypothesis direction against observed metric direction.
 * For unstructured evidence, uses deterministic keyword/rule classification.
 * Optionally provides LLM classifier interface (but must be optional).
 */

import type { EvidenceItem, EvidenceRequest, EvidenceDirection } from "../types";

/** Direction classification result */
export interface DirectionClassification {
  direction: EvidenceDirection;
  confidence: number; // [0,1]
  matchedTerms: string[];
  reasoning: string;
}

/** Classify evidence direction relative to hypothesis */
export function classifyDirection(
  item: EvidenceItem,
  request: EvidenceRequest,
  expectedDirection: "positive" | "negative"
): DirectionClassification {
  // For structured evidence, use metric comparison
  if (item.provenance.retrievalMethod === "structured" && item.structuredData) {
    return classifyStructuredDirection(item, expectedDirection);
  }
  
  // For unstructured evidence, use keyword-based classification
  return classifyUnstructuredDirection(item, expectedDirection);
}

/** Classify structured evidence direction */
function classifyStructuredDirection(
  item: EvidenceItem,
  expectedDirection: "positive" | "negative"
): DirectionClassification {
  const data = item.structuredData!;
  const changePct = data.changePct ?? 0;
  
  if (changePct === 0) {
    return {
      direction: "neutral",
      confidence: 0.5,
      matchedTerms: [],
      reasoning: "No change observed in structured metric",
    };
  }
  
  const observedDirection = changePct > 0 ? "positive" : "negative";
  const matches = observedDirection === expectedDirection;
  
  return {
    direction: matches ? "support" : "contradict",
    confidence: 0.95, // High confidence for structured data
    matchedTerms: [`${data.metric}: ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`],
    reasoning: `Structured ${data.metric} ${observedDirection === "positive" ? "increased" : "decreased"} ${Math.abs(changePct).toFixed(1)}% (hypothesis expected ${expectedDirection})`,
  };
}

/** Classify unstructured evidence direction using keywords */
export function classifyUnstructuredDirection(
  item: EvidenceItem,
  expectedDirection: "positive" | "negative"
): DirectionClassification {
  const text = item.text.toLowerCase();
  
  // Define directional keywords
  const positiveKeywords = [
    "increase", "increased", "increasing", "growth", "grew", "improve", "improved", "improving",
    "recovery", "recovered", "recovering", "up", "higher", "better", "positive", "gain", "gains",
    "rise", "rose", "rising", "boost", "boosted", "strengthen", "strengthened",
    "availability improved", "stockout decreased", "stockout rate down", "stockout rate dropped",
    "inventory improved", "fill rate improved", "on-time improved",
    "conversion improved", "conversion up", "conversion increased",
    "revenue up", "revenue growth", "sales up", "orders up",
  ];
  
  const negativeKeywords = [
    "decrease", "decreased", "decreasing", "decline", "declined", "declining",
    "drop", "dropped", "dropping", "fall", "fell", "falling",
    "worse", "negative", "loss", "losses", "down", "lower", "reduce", "reduced",
    "deteriorate", "deteriorated", "deteriorating", "weaken", "weakened",
    "stockout increased", "stockout rate up", "stockout rate rose", "stockout rate climbed",
    "availability down", "availability decreased", "availability dropped",
    "out of stock", "unavailable", "shortage", "stockout", "stockouts",
    "delay", "delayed", "delays", "late", "behind schedule",
    "conversion down", "conversion dropped", "conversion fell",
    "revenue down", "revenue decline", "revenue dropped", "sales down", "orders down",
    "cancelled", "cancellation", "churn", "lost",
  ];
  
  const positiveMatches: string[] = [];
  const negativeMatches: string[] = [];
  
  for (const kw of positiveKeywords) {
    if (text.includes(kw.toLowerCase())) {
      positiveMatches.push(kw);
    }
  }
  
  for (const kw of negativeKeywords) {
    if (text.includes(kw.toLowerCase())) {
      negativeMatches.push(kw);
    }
  }
  
  let direction: EvidenceDirection = "neutral";
  let confidence = 0.5;
  let reasoning = "";
  
  const posCount = positiveMatches.length;
  const negCount = negativeMatches.length;
  
  if (posCount > negCount) {
    direction = expectedDirection === "positive" ? "support" : "contradict";
    confidence = Math.min(0.5 + (posCount - negCount) * 0.1, 0.9);
    reasoning = `Found ${posCount} positive indicators vs ${negCount} negative indicators`;
  } else if (negCount > posCount) {
    direction = expectedDirection === "negative" ? "support" : "contradict";
    confidence = Math.min(0.5 + (negCount - posCount) * 0.1, 0.9);
    reasoning = `Found ${negCount} negative indicators vs ${posCount} positive indicators`;
  } else {
    direction = "neutral";
    confidence = 0.5;
    reasoning = `Balanced indicators: ${posCount} positive, ${negCount} negative`;
  }
  
  return {
    direction,
    confidence,
    matchedTerms: [...positiveMatches, ...negativeMatches],
    reasoning,
  };
}

/** Optional LLM-based classification interface */
export interface LLMDirectionClassifier {
  classify(
    hypothesis: string,
    expectedDirection: "positive" | "negative",
    evidenceText: string,
    evidenceMetadata: Record<string, unknown>
  ): Promise<DirectionClassification>;
}

/** Null classifier (no LLM) */
export const nullLLMClassifier: LLMDirectionClassifier = {
  async classify() {
    return {
      direction: "neutral",
      confidence: 0,
      matchedTerms: [],
      reasoning: "LLM classifier not configured",
    };
  },
};

/** Classify with optional LLM fallback */
export async function classifyDirectionWithLLM(
  item: EvidenceItem,
  request: EvidenceRequest,
  expectedDirection: "positive" | "negative",
  llmClassifier?: LLMDirectionClassifier
): Promise<DirectionClassification> {
  // First, use deterministic classification
  const deterministic = classifyDirection(item, request, expectedDirection);
  
  // If LLM is available and confidence is low, try LLM
  if (llmClassifier && deterministic.confidence < 0.7) {
    try {
      const llmResult = await llmClassifier.classify(
        request.driver,
        expectedDirection,
        item.text,
        { source: item.provenance.source, region: item.provenance.region }
      );
      
      // Blend results (prefer deterministic for high confidence)
      if (llmResult.confidence > deterministic.confidence) {
        return {
          ...llmResult,
          reasoning: `${llmResult.reasoning} (LLM-assisted)`,
        };
      }
    } catch (error) {
      console.warn("LLM direction classification failed:", error);
    }
  }
  
  return deterministic;
}