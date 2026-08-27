/**
 * Segment consistency, contradiction, ranking, evidence and abstention
 * (Tests 15-19, Tasks 10-14).
 */

import { calculateSegmentConsistency } from "../segmentation";
import { deriveContradictions } from "../contradiction";
import {
  calculateCausalPlausibility,
  calculateEvidenceAvailability,
  generateHypotheses,
  generateEvidenceRequests,
} from "../hypothesis";
import { DEFAULT_DRIVER_CONFIG } from "../config";
import { getDriverDefinition } from "../definitions";
import type { AssociationResult, SegmentConsistency, TemporalAlignment, DriverContribution } from "../types";

const PERIOD = "2026-08";

const assoc = (over: Partial<AssociationResult>): AssociationResult => ({
  driver: "discount",
  pearsonR: 0.5,
  spearmanRho: 0.5,
  sampleSize: 12,
  associationStrength: "moderate",
  pValue: 0.01,
  isStatisticallySignificant: true,
  alpha: 0.05,
  insufficientData: false,
  ...over,
});

const seg = (over: Partial<SegmentConsistency>): SegmentConsistency => ({
  driver: "discount",
  consistencyScore: 1,
  consistentSegments: ["North", "South"],
  inconsistentSegments: [],
  skippedSegments: [],
  evaluatedSegments: 2,
  insufficientData: false,
  ...over,
});

describe("Test 15 - segment consistency", () => {
  it("evaluates non-KPI drivers instead of failing to zero", async () => {
    // `discount` is not a KPI metric; the old getKPIBreakdown path threw here.
    const r = await calculateSegmentConsistency("revenue", "discount", PERIOD, "region");
    expect(r).toBeDefined();
    expect(Array.isArray(r.consistentSegments)).toBe(true);
    expect(Array.isArray(r.inconsistentSegments)).toBe(true);
  });

  it("reports skipped segments separately from inconsistent ones", async () => {
    const r = await calculateSegmentConsistency("revenue", "discount", PERIOD, "region");
    expect(r).toHaveProperty("skippedSegments");
    // A skipped segment must never be counted as a contradiction.
    for (const s of r.skippedSegments ?? []) {
      expect(r.inconsistentSegments).not.toContain(s);
    }
  });

  it("scores consistency as consistent / evaluated", async () => {
    const r = await calculateSegmentConsistency("revenue", "stockouts_revenue", PERIOD, "region");
    if (!r.insufficientData) {
      expect(r.consistencyScore).toBeCloseTo(
        r.consistentSegments.length / (r.evaluatedSegments ?? 1),
        6
      );
      expect(r.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(r.consistencyScore).toBeLessThanOrEqual(1);
    }
  });

  it("abstains with a reason when too few segments are measurable", async () => {
    // Pinning the region collapses the region dimension to a single segment.
    const r = await calculateSegmentConsistency("revenue", "discount", PERIOD, "region", { region: "North" });
    expect(r.insufficientData).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it("preserves affected / unaffected segment detail", async () => {
    const r = await calculateSegmentConsistency("revenue", "discount", PERIOD, "region");
    expect(r).toHaveProperty("affectedSegments");
    expect(r).toHaveProperty("unaffectedSegments");
  });
});

describe("Test 16 - contradiction", () => {
  it("raises a contradiction only when the association is significant", () => {
    // `discount` expects a negative relationship; observed r is positive.
    const significant = deriveContradictions(
      [assoc({ pearsonR: 0.62, pValue: 0.01, isStatisticallySignificant: true, sampleSize: 12 })],
      [seg({})]
    );
    expect(significant.filter((c) => c.basis === "association")).toHaveLength(1);
  });

  it("does NOT raise a contradiction on a non-significant correlation", () => {
    // |r| = 0.35 clears the old 0.3 threshold but p = 0.26 is consistent with noise.
    const noisy = deriveContradictions(
      [assoc({ pearsonR: 0.35, pValue: 0.26, isStatisticallySignificant: false, sampleSize: 12 })],
      [seg({})]
    );
    expect(noisy.filter((c) => c.basis === "association")).toHaveLength(0);
  });

  it("requires a minimum sample size", () => {
    const tiny = deriveContradictions(
      [assoc({ pearsonR: 0.9, pValue: 0.001, isStatisticallySignificant: true, sampleSize: 3 })],
      [seg({})]
    );
    expect(tiny.filter((c) => c.basis === "association")).toHaveLength(0);
  });

  it("does not raise a contradiction when direction matches expectation", () => {
    const matching = deriveContradictions(
      [assoc({ pearsonR: -0.8, pValue: 0.001, isStatisticallySignificant: true, sampleSize: 12 })],
      [seg({})]
    );
    expect(matching.filter((c) => c.basis === "association")).toHaveLength(0);
  });

  it("raises a segment contradiction when most segments disagree", () => {
    const contradictions = deriveContradictions(
      [assoc({ pearsonR: -0.8, isStatisticallySignificant: true })],
      [seg({ consistentSegments: [], inconsistentSegments: ["North", "South", "East"], evaluatedSegments: 3, consistencyScore: 0 })]
    );
    expect(contradictions.filter((c) => c.basis === "segment")).toHaveLength(1);
  });

  it("keeps the hypothesis and penalises confidence rather than deleting it", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD);
    const withContradiction = hypotheses.filter((h) => (h.contradictions?.length ?? 0) > 0);
    for (const h of withContradiction) {
      // Still present, still ranked, but penalised and caveated.
      expect(h.scoreBreakdown!.contradictionPenalty).toBeGreaterThan(0);
      expect(h.confidence).toBeLessThanOrEqual(h.score);
      expect(h.caveats.some((c) => /Contradictory evidence/i.test(c))).toBe(true);
    }
  });
});

describe("Test 17 - hypothesis ranking", () => {
  it("returns hypotheses sorted by descending confidence with sequential ids", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    expect(hypotheses.length).toBeGreaterThan(0);
    for (let i = 1; i < hypotheses.length; i++) {
      expect(hypotheses[i - 1].confidence).toBeGreaterThanOrEqual(hypotheses[i].confidence);
    }
    expect(hypotheses.map((h) => h.id)).toEqual(hypotheses.map((_, i) => `H${i + 1}`));
  });

  it("computes score as the configured weighted sum of its components", async () => {
    const w = DEFAULT_DRIVER_CONFIG.hypothesisWeights;
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    for (const h of hypotheses) {
      const b = h.scoreBreakdown!;
      const expected =
        w.contribution * b.contribution +
        w.association * b.association +
        w.temporal * b.temporal +
        w.segmentConsistency * b.segmentConsistency +
        w.causalPlausibility * b.causalPlausibility +
        w.evidenceAvailability * b.evidenceAvailability;
      expect(h.score).toBeCloseTo(expected, 10);
    }
  });

  it("keeps confidence within [0,1]", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    for (const h of hypotheses) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("never asserts causation in claim text", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    for (const h of hypotheses) {
      expect(h.claim).not.toMatch(/\bcaused\b|\bcauses\b|\bcausing\b/i);
    }
  });
});

describe("Test 18 - evidence availability", () => {
  const contribution: DriverContribution = {
    driver: "discount",
    contributionPct: 50,
    signedContributionPct: 50,
    magnitudeContributionPct: 50,
    contributionType: "exact",
    change: 10,
    changePct: 5,
  };
  const temporal: TemporalAlignment = {
    driver: "discount", bestLag: 1, lagCorrelation: 0.8, temporalScore: 0.8,
    lagDirection: "leads", sampleSize: 12, insufficientData: false,
  };

  it("is NOT driven by the number of evidence requests", () => {
    // The old bug: evidenceRequests.length / 5.
    const manyLevers = generateEvidenceRequests("conversion", "orders", PERIOD); // 4 levers
    const fewLevers = generateEvidenceRequests("price", "revenue", PERIOD);      // 3 levers
    expect(manyLevers.length).toBeGreaterThan(fewLevers.length);

    // Availability depends only on observations that actually exist.
    const a = calculateEvidenceAvailability("discount", contribution, assoc({}), temporal, seg({}));
    const b = calculateEvidenceAvailability("stockouts", contribution, assoc({}), temporal, seg({}));
    expect(a.score).toBeCloseTo(b.score, 10);
  });

  it("is the fraction of required observations that exist", () => {
    const full = calculateEvidenceAvailability("discount", contribution, assoc({}), temporal, seg({}));
    expect(full.observedChecks).toBe(full.requiredChecks);
    expect(full.structuredEvidenceAvailability).toBeCloseTo(1, 10);

    const partial = calculateEvidenceAvailability(
      "discount", contribution, assoc({ insufficientData: true, pearsonR: null }), undefined, undefined
    );
    expect(partial.observedChecks).toBeLessThan(partial.requiredChecks);
    expect(partial.structuredEvidenceAvailability).toBeLessThan(1);
    expect(partial.missing).toEqual(
      expect.arrayContaining(["statistical_association", "temporal_alignment", "segment_breakdown"])
    );
  });

  it("reports unstructured evidence as 0 until Module 4 exists", () => {
    const e = calculateEvidenceAvailability("discount", contribution, assoc({}), temporal, seg({}));
    expect(e.unstructuredEvidenceAvailability).toBe(0);
    expect(e.note).toMatch(/Module 4/i);
  });

  it("scores 0 structured availability for a driver with no resolver", () => {
    const e = calculateEvidenceAvailability("refunds", undefined, undefined, undefined, undefined);
    expect(e.observedChecks).toBe(0);
    expect(e.score).toBe(0);
  });
});

describe("Test 19 - abstention", () => {
  it("marks a driver with no resolver as insufficient_data, not a measured null", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    const refunds = hypotheses.find((h) => h.driver === "refunds")!;

    expect(refunds.status).toBe("insufficient_data");
    // The key distinction: null, not a fabricated r = 0.
    expect(refunds.associationScore).toBeNull();
    expect(refunds.pValue).toBeNull();
    expect(refunds.sampleSize).toBe(0);
    expect(refunds.caveats.some((c) => /no sql-backed history resolver/i.test(c))).toBe(true);
  });

  it("distinguishes insufficient data from a weak but measured candidate", async () => {
    const hypotheses = await generateHypotheses("revenue", PERIOD, { region: "North" });
    const measured = hypotheses.filter((h) => h.associationScore !== null);
    const unmeasured = hypotheses.filter((h) => h.associationScore === null);

    expect(measured.length).toBeGreaterThan(0);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const h of measured) {
      expect(h.sampleSize).toBeGreaterThan(0);
      expect(h.pValue).not.toBeNull();
    }
  });

  it("Task 12 - causal plausibility does not reward negative expected direction", () => {
    const negativeDriver = getDriverDefinition("discount")!;   // expectedDirection: negative
    const positiveDriver = getDriverDefinition("orders")!;     // expectedDirection: positive

    // Identical observable evidence for both.
    const temporal: TemporalAlignment = {
      driver: "x", bestLag: 0, lagCorrelation: 0.5, temporalScore: 0.5,
      lagDirection: "contemporaneous", sampleSize: 12, insufficientData: false,
    };
    // Movement consistent with each driver's own mechanism.
    const neg = calculateCausalPlausibility(negativeDriver, +10, -10, temporal);
    const pos = calculateCausalPlausibility(positiveDriver, -10, -10, temporal);

    expect(neg.score).toBeCloseTo(pos.score, 10);
  });

  it("Task 12 - plausibility rises with direction consistency and temporal precedence", () => {
    const def = getDriverDefinition("discount")!;
    const leads: TemporalAlignment = {
      driver: "discount", bestLag: 2, lagCorrelation: 0.7, temporalScore: 0.7,
      lagDirection: "leads", sampleSize: 12, insufficientData: false,
    };
    const lags: TemporalAlignment = { ...leads, bestLag: -2, lagDirection: "lags" };

    // discount is a negative driver: discount up while KPI down is consistent.
    const consistent = calculateCausalPlausibility(def, +10, -10, leads);
    const inconsistent = calculateCausalPlausibility(def, -10, -10, leads);
    expect(consistent.score).toBeGreaterThan(inconsistent.score);

    const following = calculateCausalPlausibility(def, +10, -10, lags);
    expect(consistent.score).toBeGreaterThan(following.score);
  });
});
