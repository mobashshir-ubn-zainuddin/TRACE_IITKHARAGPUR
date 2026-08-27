/**
 * Module 4: Synthetic Enterprise Evidence Dataset
 * 
 * Deterministic synthetic evidence for the existing TRACE demo scenario.
 * Includes realistic evidence from different source types.
 * 
 * Includes BOTH supporting and contradictory evidence.
 * 
 * Example supporting evidence:
 * "Product A experienced six days of below-target availability
 * in the North region during August 2026."
 * 
 * Example contradictory evidence:
 * "Product A inventory returned to target during the final week
 * of August 2026."
 * 
 * The dataset must be deterministic and reproducible.
 * Do not invent external real-world sources.
 * Clearly mark synthetic/demo evidence in metadata.
 */

interface SyntheticEvidenceChunk {
  text: string;
  region: string;
  product: string;
  date_start: string;
  date_end: string;
  metadata: Record<string, unknown>;
}

import type { EvidenceSourceType } from "./types";
import { generateContentHash } from "@/server/evidence/embeddings/provider";

interface SyntheticEvidenceChunk {
  text: string;
  region: string;
  product: string;
  date_start: string;
  date_end: string;
  metadata: Record<string, unknown>;
}

interface SyntheticDocument {
  source: string;
  title: string;
  document_type: EvidenceSourceType;
  region: string;
  product: string;
  topic: string;
  document_date: string;
  authority_score: number;
  chunks: Array<SyntheticEvidenceChunk>;
}

export const SYNTHETIC_EVIDENCE_DOCUMENTS: Array<{
  source: string;
  title: string;
  document_type: EvidenceSourceType;
  region: string;
  product: string;
  topic: string;
  document_date: string;
  authority_score: number;
  chunks: Array<{
    text: string;
    region: string;
    product: string;
    date_start: string;
    date_end: string;
    metadata: Record<string, unknown>;
  }>;
}> = [
  // ============================================
  // SUPPORTING EVIDENCE FOR STOCKOUTS HYPOTHESIS
  // ============================================
  {
    source: "Operations",
    title: "North Region Inventory Operations Report - August 2026",
    document_type: "operations_report",
    region: "North",
    product: "Product A",
    topic: "Stockouts",
    document_date: "2026-08-31",
    authority_score: 0.90,
    chunks: [
      {
        text: "During the second week of August 2026, Product A experienced six consecutive days of below-target availability in the North region. Warehouse replenishment was delayed due to supplier constraints affecting the primary distribution center. Stockout rate for Product A in North reached 31% during August 8-14, compared to a historical average of 8%.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-08",
        date_end: "2026-08-14",
        metadata: { stockout_rate: 31, historical_avg: 8, days_below_target: 6, supplier_constraint: true }
      },
      {
        text: "Product B availability in North region deteriorated during August 15-21, with stockout rate increasing to 24%. The root cause was identified as delayed inbound shipments from Supplier X due to transportation disruptions. This affected 3 of 5 North region fulfillment centers.",
        region: "North",
        product: "Product B",
        date_start: "2026-08-15",
        date_end: "2026-08-21",
        metadata: { stockout_rate: 24, fulfillment_centers_affected: 3, supplier: "Supplier X" }
      },
      {
        text: "Overall North region stockout rate for August 2026 was 18.2%, significantly above the 6.5% target. Product A and Product B accounted for 72% of total stockout incidents. Estimated revenue impact from stockouts: ₹42.3M across affected products.",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { overall_stockout_rate: 18.2, target: 6.5, revenue_impact: 42300000, affected_products: ["Product A", "Product B"] }
      }
    ]
  },
  {
    source: "Customer Support",
    title: "Customer Support Ticket Summary - North Region August 2026",
    document_type: "support_ticket",
    region: "North",
    product: "Product A",
    topic: "Inventory",
    document_date: "2026-08-25",
    authority_score: 0.70,
    chunks: [
      {
        text: "Multiple customers reported Product A being unavailable for purchase between August 8-14. Ticket volume for 'product unavailable' increased 340% vs July. Customers specifically mentioned North region fulfillment centers. Average wait time for backorder fulfillment: 12 days.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-08",
        date_end: "2026-08-14",
        metadata: { ticket_volume_increase_pct: 340, avg_wait_days: 12, issue_type: "product_unavailable" }
      },
      {
        text: "Customer complaints for Product B stockouts in North region increased 180% during August 15-21. Several enterprise customers reported order cancellations due to extended lead times. Escalation rate for inventory issues: 23% of all North region tickets.",
        region: "North",
        product: "Product B",
        date_start: "2026-08-15",
        date_end: "2026-08-21",
        metadata: { ticket_volume_increase_pct: 180, order_cancellations: true, escalation_rate: 23 }
      }
    ]
  },
  {
    source: "Inventory System",
    title: "Inventory Availability Report - North Region Products A & B - August 2026",
    document_type: "inventory_report",
    region: "North",
    product: "Product A",
    topic: "Inventory",
    document_date: "2026-08-31",
    authority_score: 1.00,
    chunks: [
      {
        text: "Product A: North region inventory levels dropped to 12% of target during August 8-14 (target: 1500 units, actual: 180 units). Replenishment orders PO-2026-08-012 and PO-2026-08-018 were delayed by 9 and 11 days respectively. Fill rate for Product A North: 67% vs 94% target.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-08",
        date_end: "2026-08-14",
        metadata: { inventory_pct_of_target: 12, target_units: 1500, actual_units: 180, fill_rate: 67, target_fill_rate: 94, delayed_pos: 2 }
      },
      {
        text: "Product B: North region inventory at 34% of target during August 15-21. Safety stock depleted on August 16. Emergency expedite orders placed but arrived after peak demand period. Fill rate: 71% vs 92% target.",
        region: "North",
        product: "Product B",
        date_start: "2026-08-15",
        date_end: "2026-08-21",
        metadata: { inventory_pct_of_target: 34, safety_stock_depleted: true, fill_rate: 71, target_fill_rate: 92 }
      }
    ]
  },

  // ============================================
  // CONTRADICTING EVIDENCE FOR STOCKOUTS HYPOTHESIS
  // ============================================
  {
    source: "Operations",
    title: "North Region Inventory Recovery Report - Late August 2026",
    document_type: "operations_report",
    region: "North",
    product: "Product A",
    topic: "Inventory Recovery",
    document_date: "2026-08-31",
    authority_score: 0.90,
    chunks: [
      {
        text: "Product A inventory returned to target levels during the final week of August 2026 (August 25-31). North region availability reached 96% of target. Expedited shipments from alternative supplier (Supplier Y) arrived August 22. Stockout rate normalized to 4.2% for the final week.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-25",
        date_end: "2026-08-31",
        metadata: { availability_pct_of_target: 96, stockout_rate: 4.2, alternative_supplier: "Supplier Y", recovery_date: "2026-08-22" }
      },
      {
        text: "Product B availability recovered to 89% of target by August 28. The recovery was faster than initially projected. However, the two-week stockout period during peak demand (Aug 8-21) likely caused irreversible order loss for that period.",
        region: "North",
        product: "Product B",
        date_start: "2026-08-25",
        date_end: "2026-08-28",
        metadata: { availability_pct_of_target: 89, recovery_note: "faster_than_projected", irreversible_loss: true }
      }
    ]
  },
  {
    source: "Fulfillment",
    title: "Fulfillment Center Performance - North Region August 2026",
    document_type: "fulfillment_report",
    region: "North",
    product: "All",
    topic: "Fulfillment",
    document_date: "2026-08-31",
    authority_score: 0.80,
    chunks: [
      {
        text: "North fulfillment center FC-N1 maintained 98.5% order accuracy during August despite inventory challenges. The center prioritized available SKUs and achieved 91% on-time shipping for in-stock items. Substitution rate for out-of-stock items: 12% (customers accepted alternative products).",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { order_accuracy: 98.5, on_time_shipping: 91, substitution_rate: 12, fulfillment_center: "FC-N1" }
      }
    ]
  },

  // ============================================
  // SUPPORTING EVIDENCE FOR DISCOUNTING HYPOTHESIS
  // ============================================
  {
    source: "Pricing",
    title: "Pricing Strategy Report - North Region August 2026",
    document_type: "pricing_report",
    region: "North",
    product: "Product A",
    topic: "Discounting",
    document_date: "2026-08-31",
    authority_score: 0.80,
    chunks: [
      {
        text: "Average discount rate for Product A in North region increased to 18.5% in August 2026, up from 12.1% in July and 9.8% historical average. The increase was driven by promotional campaign 'END_OF_SUMMER' (campaign code: EOS-2026-N) offering 20% off Product A to clear aging inventory.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { discount_rate: 18.5, prev_month: 12.1, historical_avg: 9.8, campaign: "END_OF_SUMMER", campaign_code: "EOS-2026-N" }
      },
      {
        text: "Product B discount rate in North: 15.2% in August vs 10.3% in July. Campaign 'LOYALTY_BOOST' offered tiered discounts (10% for 1-2 units, 15% for 3-5 units, 20% for 6+ units). Total promotional revenue attributed to discounts: ₹28.7M. Margin impact: -3.2 percentage points on affected products.",
        region: "North",
        product: "Product B",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { discount_rate: 15.2, prev_month: 10.3, campaign: "LOYALTY_BOOST", promo_revenue: 28700000, margin_impact_pct: -3.2 }
      }
    ]
  },
  {
    source: "Marketing",
    title: "Marketing Campaign Performance - North Region August 2026",
    document_type: "marketing_report",
    region: "North",
    product: "Product A",
    topic: "Promotions",
    document_date: "2026-08-31",
    authority_score: 0.75,
    chunks: [
      {
        text: "Campaign EOS-2026-N (End of Summer) ran August 1-20. Spend: ₹4.2M. Attributed revenue: ₹31.5M. ROAS: 7.5x. Conversion rate: 3.8% (vs 2.9% baseline). The campaign drove significant volume but at reduced margins. 67% of attributed revenue came from discounted Product A sales.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-01",
        date_end: "2026-08-20",
        metadata: { campaign: "EOS-2026-N", spend: 4200000, attributed_revenue: 31500000, roas: 7.5, conversion_rate: 3.8, baseline_conversion: 2.9, discounted_revenue_pct: 67 }
      }
    ]
  },

  // ============================================
  // SUPPORTING EVIDENCE FOR ORDERS DECLINE
  // ============================================
  {
    source: "Sales Transactions",
    title: "Sales Transaction Analysis - North Region August 2026",
    document_type: "structured",
    region: "North",
    product: "All",
    topic: "Orders",
    document_date: "2026-08-31",
    authority_score: 1.00,
    chunks: [
      {
        text: "North region orders declined 15.2% in August 2026 vs July 2026 (24,424 vs 28,817 orders). Product A orders: -22.4% (6,892 vs 8,878). Product B orders: -18.7% (4,103 vs 5,048). Product C orders: -8.3% (3,211 vs 3,501). Channel breakdown: Online -19.2%, Retail -11.8%, Partner -9.4%.",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { 
          orders_current: 24424, orders_previous: 28817, change_pct: -15.2,
          by_product: { "Product A": -22.4, "Product B": -18.7, "Product C": -8.3 },
          by_channel: { "Online": -19.2, "Retail": -11.8, "Partner": -9.4 }
        }
      }
    ]
  },
  {
    source: "Marketing",
    title: "Conversion Rate Analysis - North Region August 2026",
    document_type: "marketing_report",
    region: "North",
    product: "All",
    topic: "Conversion",
    document_date: "2026-08-31",
    authority_score: 0.75,
    chunks: [
      {
        text: "North region conversion rate declined to 2.1% in August from 2.8% in July (-25% relative). Sessions decreased 8% (1,142,000 vs 1,241,000). The conversion drop was most pronounced in Online channel: 1.9% vs 2.7% (-30%). Attributed revenue per session: ₹27.6 vs ₹34.2 (-19%).",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { 
          conversion_rate: 2.1, prev_conversion: 2.8, change_pct: -25,
          sessions_current: 1142000, sessions_previous: 1241000, sessions_change_pct: -8,
          online_conversion: 1.9, online_prev: 2.7, online_change_pct: -30,
          revenue_per_session: 27.6, prev_revenue_per_session: 34.2
        }
      }
    ]
  },

  // ============================================
  // CONTRADICTING EVIDENCE FOR ORDERS (showing recovery signals)
  // ============================================
  {
    source: "Marketing",
    title: "Late August Conversion Recovery Signals - North Region",
    document_type: "marketing_report",
    region: "North",
    product: "All",
    topic: "Conversion Recovery",
    document_date: "2026-08-31",
    authority_score: 0.75,
    chunks: [
      {
        text: "Conversion rate showed recovery in the final week of August (Aug 25-31), reaching 2.6% - close to July levels. This coincided with the launch of 'BACK_TO_SCHOOL' campaign (BTS-2026-N) starting August 22. Week-over-week conversion improvement: +24%. Sessions also recovered to 298,000 (vs 265,000 prior week).",
        region: "North",
        product: "All",
        date_start: "2026-08-25",
        date_end: "2026-08-31",
        metadata: { conversion_rate: 2.6, recovery_week: true, campaign: "BACK_TO_SCHOOL", wow_improvement_pct: 24, sessions: 298000 }
      }
    ]
  },

  // ============================================
  // SUPPORTING EVIDENCE FOR AOV DECLINE
  // ============================================
  {
    source: "Pricing",
    title: "Average Order Value Analysis - North Region August 2026",
    document_type: "pricing_report",
    region: "North",
    product: "All",
    topic: "AOV",
    document_date: "2026-08-31",
    authority_score: 0.80,
    chunks: [
      {
        text: "North region AOV declined 3.8% in August 2026 (₹3,112 vs ₹3,235 in July). Primary drivers: 1) Discounting impact: -2.4 ppt, 2) Product mix shift toward lower-priced SKUs: -1.1 ppt, 3) Reduced premium product (Product A) share: -0.3 ppt. Product A share of revenue dropped from 42% to 35%.",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { 
          aov_current: 3112, aov_previous: 3235, change_pct: -3.8,
          discounting_impact_ppt: -2.4, mix_shift_impact_ppt: -1.1, premium_share_impact_ppt: -0.3,
          product_a_revenue_share: 35, prev_product_a_share: 42
        }
      }
    ]
  },

  // ============================================
  // CONTRADICTING EVIDENCE FOR AOV (premium product performance)
  // ============================================
  {
    source: "Sales Transactions",
    title: "Premium Product Performance - South Region August 2026",
    document_type: "structured",
    region: "South",
    product: "Product A",
    topic: "Premium Performance",
    document_date: "2026-08-31",
    authority_score: 1.00,
    chunks: [
      {
        text: "South region Product A AOV increased 2.1% in August (₹4,520 vs ₹4,427). Product A revenue share in South grew from 38% to 41%. This contradicts the North region trend and suggests the AOV decline is region-specific, not product-inherent. South had no stockouts and minimal discounting on Product A.",
        region: "South",
        product: "Product A",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { aov_change_pct: 2.1, revenue_share: 41, prev_revenue_share: 38, no_stockouts: true, minimal_discounting: true }
      }
    ]
  },

  // ============================================
  // MARKETING ROI EVIDENCE
  // ============================================
  {
    source: "Marketing",
    title: "Marketing ROI Analysis - North Region August 2026",
    document_type: "marketing_report",
    region: "North",
    product: "All",
    topic: "Marketing ROI",
    document_date: "2026-08-31",
    authority_score: 0.75,
    chunks: [
      {
        text: "North region Marketing ROI declined to 3.2x in August from 4.8x in July (-33%). Marketing spend increased 12% (₹47.2M vs ₹42.1M) while attributed revenue decreased 8% (₹151M vs ₹164M). Campaign EOS-2026-N had strong ROAS (7.5x) but cannibalized full-price sales. Channel efficiency: Online ROAS 5.2x, Retail 2.8x, Partner 4.1x.",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { 
          roi_current: 3.2, roi_previous: 4.8, change_pct: -33,
          spend_current: 47200000, spend_previous: 42100000, spend_change_pct: 12,
          attributed_rev_current: 151000000, attributed_rev_previous: 164000000, attr_rev_change_pct: -8,
          eos_roas: 7.5, cannibalization: true,
          channel_roas: { "Online": 5.2, "Retail": 2.8, "Partner": 4.1 }
        }
      }
    ]
  },

  // ============================================
  // GENERAL REGIONAL PERFORMANCE CONTEXT
  // ============================================
  {
    source: "Regional Management",
    title: "Regional Performance Review - North vs Other Regions August 2026",
    document_type: "internal_report",
    region: "North",
    product: "All",
    topic: "Regional Performance",
    document_date: "2026-08-31",
    authority_score: 0.90,
    chunks: [
      {
        text: "North region revenue decline of 17.8% was the steepest across all regions in August 2026. South: -4.2%, East: -1.1%, West: +0.8%. North region unique factors: 1) Supplier X disruption (affected 60% of North SKUs), 2) Aggressive EOS promotional campaign, 3) FC-N1 fulfillment center staffing shortage (15% below plan). Other regions did not experience these compounding factors.",
        region: "North",
        product: "All",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { 
          north_revenue_change_pct: -17.8,
          other_regions: { "South": -4.2, "East": -1.1, "West": 0.8 },
          unique_factors: ["Supplier X disruption", "EOS promotional campaign", "FC-N1 staffing shortage"],
          supplier_disruption_impact_pct: 60
        }
      }
    ]
  },
  {
    source: "Customer Reviews",
    title: "Customer Review Analysis - Product Availability August 2026",
    document_type: "customer_review",
    region: "North",
    product: "Product A",
    topic: "Availability",
    document_date: "2026-08-31",
    authority_score: 0.60,
    chunks: [
      {
        text: "Analysis of 1,247 customer reviews for Product A in August 2026. 34% mentioned availability issues (vs 5% historical). Sentiment score for availability mentions: -0.72 (highly negative). Common phrases: 'out of stock for weeks', 'disappointed by availability', 'switched to competitor'. 23% of negative availability reviews mentioned they purchased from a competitor instead.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { review_count: 1247, availability_mention_pct: 34, historical_mention_pct: 5, sentiment_score: -0.72, competitor_switch_pct: 23 }
      }
    ]
  },
  {
    source: "Customer Reviews",
    title: "Customer Review Analysis - Pricing Perception August 2026",
    document_type: "customer_review",
    region: "North",
    product: "Product A",
    topic: "Pricing",
    document_date: "2026-08-31",
    authority_score: 0.60,
    chunks: [
      {
        text: "Pricing sentiment for Product A in North: 41% positive (mentioning 'good value', 'great deal'), 28% negative ('overpriced even with discount', 'feels like artificial inflation before sale'). The promotional pricing created mixed perception - some customers appreciated discounts, others felt regular pricing was inflated.",
        region: "North",
        product: "Product A",
        date_start: "2026-08-01",
        date_end: "2026-08-31",
        metadata: { positive_pct: 41, negative_pct: 28, mixed_perception: true }
      }
    ]
  }
] as const;

/** 
 * Get synthetic evidence for a specific hypothesis/driver
 * Used to seed the database deterministically
 */
export function getSyntheticEvidenceForDriver(
  driver: string,
  region?: string,
  product?: string
): Array<SyntheticEvidenceChunk> {
  const chunks: SyntheticEvidenceChunk[] = [];
  for (const doc of SYNTHETIC_EVIDENCE_DOCUMENTS) {
    const driverMatch = doc.topic.toLowerCase().includes(driver.toLowerCase()) ||
                       doc.chunks.some(c => c.metadata && JSON.stringify(c.metadata).toLowerCase().includes(driver.toLowerCase()));
    const regionMatch = !region || doc.region === region;
    const productMatch = !product || doc.product === product || doc.product === "All";
    if (driverMatch && regionMatch && productMatch) {
      chunks.push(...doc.chunks);
    }
  }
  return chunks;
}

/** 
 * Seed the database with synthetic evidence
 * Clears existing synthetic evidence and inserts fresh data with embeddings
 */
export async function seedSyntheticEvidence(): Promise<void> {
  const { getDB } = await import("../db");
  const { getEmbeddingService } = await import("./embeddings");
  const db = await getDB();
  const embeddingService = getEmbeddingService();
  
  // Clear existing synthetic evidence (keep real data if any)
  await db.exec(`DELETE FROM documents WHERE source IN (
    'Operations', 'Customer Support', 'Inventory System', 'Fulfillment',
    'Pricing', 'Marketing', 'Sales Transactions', 'Regional Management', 'Customer Reviews'
  )`);
  
  // Insert documents and chunks
  for (const doc of SYNTHETIC_EVIDENCE_DOCUMENTS) {
    const contentHash = generateContentHash(JSON.stringify(doc.chunks));
    
    const docResult = await db.run(`
      INSERT INTO documents (source, title, document_type, region, product, topic, document_date, authority_score, created_at, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `, doc.source, doc.title, doc.document_type, doc.region, doc.product, doc.topic, doc.document_date, doc.authority_score, contentHash);
    
    const documentId = docResult.lastID;
    
    for (let i = 0; i < doc.chunks.length; i++) {
      const chunk = doc.chunks[i];
      const chunkHash = generateContentHash(chunk.text);
      
      const chunkResult = await db.run(`
        INSERT INTO document_chunks (document_id, chunk_index, text, region, product, date_start, date_end, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, documentId, i, chunk.text, chunk.region, chunk.product, chunk.date_start, chunk.date_end, JSON.stringify(chunk.metadata));
      
      const chunkId = chunkResult.lastID;
      
      if (chunkId === undefined) {
        console.warn(`Failed to get chunk ID for chunk ${i} of document ${documentId}`);
        continue;
      }
      
      // Generate and persist embedding for this chunk
      try {
        await embeddingService.embedChunk(chunkId, chunk.text);
      } catch (error) {
        console.warn(`Failed to generate embedding for chunk ${chunkId}:`, error);
      }
    }
  }
  
console.log(`Seeded ${SYNTHETIC_EVIDENCE_DOCUMENTS.length} synthetic evidence documents with embeddings`);
}
