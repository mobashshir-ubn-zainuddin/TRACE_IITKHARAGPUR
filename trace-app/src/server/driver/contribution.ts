/**
 * Contribution / decomposition engine (Module 3, Tasks 1-3 and 6).
 *
 * ONE decomposition methodology is used throughout: exact two-factor Shapley
 * attribution. The previous code had two rival implementations of the same
 * revenue problem -- `calculateRevenueDecomposition` used Shapley while
 * `calculateDriverContributions` used a sequential decomposition that left a
 * residual "interaction" driver. They disagreed. Sequential decomposition is
 * also order-dependent (attributing the cross term to whichever factor is
 * substituted first), which Shapley is not.
 *
 * For a two-factor product/quotient f(x1, x2):
 *
 *   f00 = f(x1_0, x2_0)   f10 = f(x1_1, x2_0)
 *   f01 = f(x1_0, x2_1)   f11 = f(x1_1, x2_1)
 *
 *   phi_1 = 0.5 * [(f10 - f00) + (f11 - f01)]
 *   phi_2 = 0.5 * [(f01 - f00) + (f11 - f10)]
 *
 *   phi_1 + phi_2 = f11 - f00   (exactly, by construction)
 *
 * The interaction term is therefore ALLOCATED between the two factors, split
 * evenly. This is not the same as "there is no interaction": every result
 * carries `interactionAllocatedByShapley: true` so the distinction survives
 * into the API and UI. A residual interaction driver is only meaningful under a
 * deliberately different methodology, so none is emitted.
 *
 * Inputs come from raw SQL aggregates rather than `computeKPI`, because
 * `computeKPI` rounds. With rounded inputs, Orders x AOV != Revenue and the
 * reconciliation check fails for reasons that have nothing to do with the maths.
 */

import type {
  DimensionContribution,
  DriverContribution,
  ShapleyDecomposition,
} from "./types";
import { getKPIDefinition, normalizeMetric } from "../kpi/definitions";
import { getDriversForKPI } from "./definitions";
import { prevMonth } from "../utils/dateUtils";
import {
  getDriverHistory,
  getSalesProductAggregates,
  getDriverBreakdown,
  safeDiv,
  type DriverFilters,
  type MixLevel,
  type BreakdownDimension,
} from "./history";

/** Reconciliation tolerance. Relative where possible, with an absolute floor for tiny totals. */
const RELATIVE_TOLERANCE = 1e-9;
const ABSOLUTE_TOLERANCE = 1e-6;

function withinTolerance(error: number, total: number): boolean {
  if (!Number.isFinite(error)) return false;
  return Math.abs(error) <= Math.max(ABSOLUTE_TOLERANCE, Math.abs(total) * RELATIVE_TOLERANCE);
}

/**
 * Exact two-factor Shapley decomposition of the change in f(x1, x2).
 * Returns each factor's contribution plus the reconciliation proof.
 */
export function shapleyTwoFactorChange(
  f00: number,
  f10: number,
  f01: number,
  f11: number
): ShapleyDecomposition {
  const factor1 = 0.5 * ((f10 - f00) + (f11 - f01));
  const factor2 = 0.5 * ((f01 - f00) + (f11 - f10));
  const totalChange = f11 - f00;
  const reconciliationError = totalChange - factor1 - factor2;

  return {
    factor1,
    factor2,
    totalChange,
    reconciliationError,
    reconciles: withinTolerance(reconciliationError, totalChange),
    interactionAllocatedByShapley: true,
  };
}

/**
 * Signed and magnitude shares for a set of contributions (Tasks 2 and 3).
 *
 *   signed    = c_i / totalChange * 100        -- may exceed 100% or be negative
 *   magnitude = |c_i| / SUM|c_j| * 100         -- always [0,100], sums to ~100
 */
export function contributionShares(
  contributions: number[],
  totalChange: number
): Array<{ signedContributionPct: number | null; magnitudeContributionPct: number | null }> {
  const totalAbs = contributions.reduce((s, c) => s + Math.abs(c), 0);
  return contributions.map((c) => ({
    signedContributionPct: totalChange !== 0 ? (c / totalChange) * 100 : null,
    magnitudeContributionPct: totalAbs !== 0 ? (Math.abs(c) / totalAbs) * 100 : null,
  }));
}

/** Fetch a driver's value for the previous and current period in one batched query. */
async function twoPeriodValues(
  driverId: string,
  period: string,
  filters?: DriverFilters
): Promise<{ prev: number; current: number; hasPrev: boolean; hasCurrent: boolean }> {
  const previous = prevMonth(period);
  const history = await getDriverHistory(driverId, [previous, period], filters);
  const p = history.periods.find((x) => x.period === previous);
  const c = history.periods.find((x) => x.period === period);
  return {
    prev: p?.value ?? 0,
    current: c?.value ?? 0,
    hasPrev: p?.hasData ?? false,
    hasCurrent: c?.hasData ?? false,
  };
}

// ---------------------------------------------------------------------------
// Task 1 -- Revenue = Orders x AOV
// ---------------------------------------------------------------------------

export interface RevenueDecomposition {
  ordersContribution: number;
  aovContribution: number;
  ordersSignedContributionPct: number | null;
  aovSignedContributionPct: number | null;
  ordersMagnitudeContributionPct: number | null;
  aovMagnitudeContributionPct: number | null;
  totalChange: number;
  reconciliationError: number;
  reconciles: boolean;
  interactionAllocatedByShapley: true;
  /** Explains that interaction is allocated, not absent. */
  interactionNote: string;
  /** @deprecated Present only for older callers; always 0 because Shapley leaves no residual. */
  ordersContributionPct: number;
  aovContributionPct: number;
}

const INTERACTION_NOTE =
  "The interaction effect is allocated between Orders and AOV using Shapley attribution.";

export async function calculateRevenueDecomposition(
  metric: string,
  period: string,
  filters?: DriverFilters
): Promise<RevenueDecomposition> {
  if (normalizeMetric(metric) !== "revenue") {
    throw new Error("Revenue decomposition only available for revenue metric");
  }

  const orders = await twoPeriodValues("orders", period, filters);
  const aov = await twoPeriodValues("aov", period, filters);

  // Revenue = Orders x AOV
  const f00 = orders.prev * aov.prev;
  const f10 = orders.current * aov.prev;
  const f01 = orders.prev * aov.current;
  const f11 = orders.current * aov.current;

  const shapley = shapleyTwoFactorChange(f00, f10, f01, f11);
  const [ordersShare, aovShare] = contributionShares(
    [shapley.factor1, shapley.factor2],
    shapley.totalChange
  );

  return {
    ordersContribution: shapley.factor1,
    aovContribution: shapley.factor2,
    ordersSignedContributionPct: ordersShare.signedContributionPct,
    aovSignedContributionPct: aovShare.signedContributionPct,
    ordersMagnitudeContributionPct: ordersShare.magnitudeContributionPct,
    aovMagnitudeContributionPct: aovShare.magnitudeContributionPct,
    totalChange: shapley.totalChange,
    reconciliationError: shapley.reconciliationError,
    reconciles: shapley.reconciles,
    interactionAllocatedByShapley: true,
    interactionNote: INTERACTION_NOTE,
    ordersContributionPct: ordersShare.magnitudeContributionPct ?? 0,
    aovContributionPct: aovShare.magnitudeContributionPct ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Task 6 -- Product mix decomposition
// ---------------------------------------------------------------------------

export interface MixDecomposition {
  level: MixLevel;
  /** Composition effect: shares moved, per-item values held fixed. */
  mixEffect: number;
  /** Within-item effect: per-item values moved, shares held fixed. */
  withinEffect: number;
  totalChange: number;
  aovPrevious: number;
  aovCurrent: number;
  reconciliationError: number;
  reconciles: boolean;
  mixSignedContributionPct: number | null;
  withinSignedContributionPct: number | null;
  mixMagnitudeContributionPct: number | null;
  withinMagnitudeContributionPct: number | null;
  items: Array<{
    item: string;
    sharePrevious: number;
    shareCurrent: number;
    valuePrevious: number;
    valueCurrent: number;
    mixEffect: number;
    withinEffect: number;
  }>;
  insufficientData?: boolean;
}

/**
 * Decompose the AOV change into a composition (mix) effect and a within-item effect.
 *
 *   AOV = SUM_i (s_i * p_i),  s_i = Orders_i / TotalOrders,  p_i = Revenue_i / Orders_i
 *
 *   phi_mix    = 0.5 * [ SUM_i (s_i1 - s_i0) * p_i0 + SUM_i (s_i1 - s_i0) * p_i1 ]
 *   phi_within = 0.5 * [ SUM_i s_i0 * (p_i1 - p_i0) + SUM_i s_i1 * (p_i1 - p_i0) ]
 *
 *   phi_mix + phi_within = AOV_1 - AOV_0
 *
 * Items absent in one period take share 0 there; their per-item value falls back
 * to the period where they do exist, so an entering/exiting item registers as a
 * pure mix effect rather than a spurious within-item effect.
 */
export async function calculateProductMixDecomposition(
  period: string,
  filters?: DriverFilters,
  level: MixLevel = "product"
): Promise<MixDecomposition> {
  const previous = prevMonth(period);
  const agg = await getSalesProductAggregates([previous, period], filters, level);

  const prevItems = agg.get(previous) ?? new Map();
  const currItems = agg.get(period) ?? new Map();
  const allItems = new Set<string>([...prevItems.keys(), ...currItems.keys()]);

  const prevTotalOrders = [...prevItems.values()].reduce((s, v) => s + v.orders, 0);
  const currTotalOrders = [...currItems.values()].reduce((s, v) => s + v.orders, 0);

  const empty: MixDecomposition = {
    level,
    mixEffect: 0,
    withinEffect: 0,
    totalChange: 0,
    aovPrevious: 0,
    aovCurrent: 0,
    reconciliationError: 0,
    reconciles: true,
    mixSignedContributionPct: null,
    withinSignedContributionPct: null,
    mixMagnitudeContributionPct: null,
    withinMagnitudeContributionPct: null,
    items: [],
    insufficientData: true,
  };
  if (prevTotalOrders <= 0 || currTotalOrders <= 0 || allItems.size === 0) return empty;

  let mixEffect = 0;
  let withinEffect = 0;
  let aovPrevious = 0;
  let aovCurrent = 0;
  const items: MixDecomposition["items"] = [];

  for (const item of allItems) {
    const p = prevItems.get(item);
    const c = currItems.get(item);

    const s0 = safeDiv(p?.orders ?? 0, prevTotalOrders) ?? 0;
    const s1 = safeDiv(c?.orders ?? 0, currTotalOrders) ?? 0;

    const p0raw = p && p.orders > 0 ? safeDiv(p.revenue, p.orders) : null;
    const p1raw = c && c.orders > 0 ? safeDiv(c.revenue, c.orders) : null;

    // An item present in only one period keeps a constant per-item value, so its
    // entry/exit is attributed entirely to mix.
    const p0 = p0raw ?? p1raw ?? 0;
    const p1 = p1raw ?? p0raw ?? 0;

    const itemMix = 0.5 * ((s1 - s0) * p0 + (s1 - s0) * p1);
    const itemWithin = 0.5 * (s0 * (p1 - p0) + s1 * (p1 - p0));

    mixEffect += itemMix;
    withinEffect += itemWithin;
    aovPrevious += s0 * p0;
    aovCurrent += s1 * p1;

    items.push({
      item,
      sharePrevious: s0,
      shareCurrent: s1,
      valuePrevious: p0,
      valueCurrent: p1,
      mixEffect: itemMix,
      withinEffect: itemWithin,
    });
  }

  const totalChange = aovCurrent - aovPrevious;
  const reconciliationError = totalChange - mixEffect - withinEffect;
  const [mixShare, withinShare] = contributionShares([mixEffect, withinEffect], totalChange);

  items.sort((a, b) => Math.abs(b.mixEffect) - Math.abs(a.mixEffect));

  return {
    level,
    mixEffect,
    withinEffect,
    totalChange,
    aovPrevious,
    aovCurrent,
    reconciliationError,
    reconciles: withinTolerance(reconciliationError, totalChange),
    mixSignedContributionPct: mixShare.signedContributionPct,
    withinSignedContributionPct: withinShare.signedContributionPct,
    mixMagnitudeContributionPct: mixShare.magnitudeContributionPct,
    withinMagnitudeContributionPct: withinShare.magnitudeContributionPct,
    items,
  };
}

// ---------------------------------------------------------------------------
// Task 3 -- Dimension contribution
// ---------------------------------------------------------------------------

/**
 * Per-segment contribution to a KPI's change.
 *
 * `signedContributionPct` is the share of NET change and is deliberately NOT
 * clamped: a region that fell while others rose can legitimately show +101% or
 * -10%. `magnitudeContributionPct` is the share of ABSOLUTE movement and is the
 * only figure that behaves like a share of impact.
 *
 * Callers and UI must present these as two distinct quantities.
 */
export async function calculateDimensionContribution(
  metric: string,
  period: string,
  dimension: BreakdownDimension,
  filters?: DriverFilters
): Promise<DimensionContribution[]> {
  const normalized = normalizeMetric(metric);
  const previous = prevMonth(period);

  const [currentRows, prevRows] = await Promise.all([
    getDriverBreakdown(normalized, period, dimension, filters),
    getDriverBreakdown(normalized, previous, dimension, filters),
  ]);

  if (currentRows.length === 0 && prevRows.length === 0) {
    throw new Error(`Breakdown not supported for ${metric} by ${dimension}`);
  }

  const currentMap = new Map(currentRows.map((b) => [b.dimensionValue, b.value]));
  const prevMap = new Map(prevRows.map((b) => [b.dimensionValue, b.value]));
  const values = [...new Set([...currentMap.keys(), ...prevMap.keys()])];

  const changes = values.map((v) => (currentMap.get(v) ?? 0) - (prevMap.get(v) ?? 0));

  // For additive KPIs the total change is the sum of segment changes. For ratio
  // KPIs (conversion, marketingROI, aov) segment values do not sum to the total,
  // so the signed share is reported against the summed segment movement and the
  // magnitude share remains the meaningful figure.
  const totalChange = changes.reduce((s, c) => s + c, 0);
  const shares = contributionShares(changes, totalChange);

  return values.map((dimensionValue, i) => {
    const prevValue = prevMap.get(dimensionValue) ?? 0;
    const change = changes[i];
    const changePct = prevValue !== 0 ? (change / prevValue) * 100 : null;

    return {
      dimension,
      dimensionValue,
      change,
      changePct,
      contributionPct: shares[i].signedContributionPct ?? 0,
      signedContributionPct: shares[i].signedContributionPct,
      magnitudeContributionPct: shares[i].magnitudeContributionPct,
    };
  });
}

// ---------------------------------------------------------------------------
// Tasks 1 & 2 -- exact factor decomposition per KPI
// ---------------------------------------------------------------------------

/** Build the two DriverContribution rows for an exact two-factor Shapley split. */
function buildShapleyContributions(
  factor1: { driver: string; explanation: string; prev: number; current: number },
  factor2: { driver: string; explanation: string; prev: number; current: number },
  shapley: ShapleyDecomposition
): DriverContribution[] {
  const [s1, s2] = contributionShares([shapley.factor1, shapley.factor2], shapley.totalChange);

  const row = (
    f: { driver: string; explanation: string; prev: number; current: number },
    contribution: number,
    share: { signedContributionPct: number | null; magnitudeContributionPct: number | null }
  ): DriverContribution => ({
    driver: f.driver,
    contribution,
    contributionPct: share.signedContributionPct,
    signedContributionPct: share.signedContributionPct,
    magnitudeContributionPct: share.magnitudeContributionPct,
    contributionType: "exact",
    change: f.current - f.prev,
    changePct: f.prev !== 0 ? ((f.current - f.prev) / f.prev) * 100 : null,
    status: "calculated",
    explanation: f.explanation,
    reconciles: shapley.reconciles,
    reconciliationError: shapley.reconciliationError,
    interactionAllocatedByShapley: true,
  });

  return [row(factor1, shapley.factor1, s1), row(factor2, shapley.factor2, s2)];
}

function insufficientPair(
  a: { driver: string; prev: number; current: number },
  b: { driver: string; prev: number; current: number },
  reason: string
): DriverContribution[] {
  const mk = (f: { driver: string; prev: number; current: number }): DriverContribution => ({
    driver: f.driver,
    contributionPct: null,
    signedContributionPct: null,
    magnitudeContributionPct: null,
    contributionType: "insufficient_data",
    change: f.current - f.prev,
    changePct: f.prev !== 0 ? ((f.current - f.prev) / f.prev) * 100 : null,
    status: "insufficient_data",
    explanation: reason,
  });
  return [mk(a), mk(b)];
}

/**
 * Movement rows for drivers that are NOT algebraic factors of the KPI.
 *
 * Without these, a driver like Discount -- which moved +129% in the ground-truth
 * scenario -- carried no `change` at all, so it scored 0 on contribution and
 * failed the "period_over_period_value" evidence check. Such drivers genuinely
 * have no exact contribution SHARE, but their movement is real and measurable,
 * so it is reported as a `statistical` contribution with a null share.
 */
async function driverMovementRows(
  normalizedMetric: string,
  period: string,
  filters: DriverFilters | undefined,
  alreadyCovered: Set<string>
): Promise<DriverContribution[]> {
  const kpiDef = getKPIDefinition(normalizedMetric);
  if (!kpiDef) return [];

  const remaining = getDriversForKPI(kpiDef.name).filter((d) => !alreadyCovered.has(d.id));

  return Promise.all(
    remaining.map(async (d): Promise<DriverContribution> => {
      const v = await twoPeriodValues(d.id, period, filters);
      const measurable = v.hasPrev && v.hasCurrent;
      return {
        driver: d.id,
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: measurable ? "statistical" : "insufficient_data",
        change: v.current - v.prev,
        changePct: v.prev !== 0 ? ((v.current - v.prev) / v.prev) * 100 : null,
        status: measurable ? "not_exactly_decomposable" : "insufficient_data",
        explanation: measurable
          ? `${d.name} is not an exact algebraic component of ${kpiDef.label}, so no exact contribution share is available. Its period-over-period movement is reported instead.`
          : `No resolvable series for ${d.name} in one or both periods.`,
      };
    })
  );
}

export async function calculateDriverContributions(
  metric: string,
  period: string,
  filters?: DriverFilters
): Promise<DriverContribution[]> {
  const normalized = normalizeMetric(metric);
  const exact = await calculateExactFactorContributions(normalized, period, filters);
  const covered = new Set(exact.map((c) => c.driver));
  const movements = await driverMovementRows(normalized, period, filters, covered);
  return [...exact, ...movements];
}

/** Exact algebraic (Shapley) factor decomposition for the metric, where one exists. */
async function calculateExactFactorContributions(
  normalized: string,
  period: string,
  filters?: DriverFilters
): Promise<DriverContribution[]> {

  // --- Revenue = Orders x AOV -------------------------------------------
  if (normalized === "revenue") {
    const orders = await twoPeriodValues("orders", period, filters);
    const aov = await twoPeriodValues("aov", period, filters);

    const shapley = shapleyTwoFactorChange(
      orders.prev * aov.prev,
      orders.current * aov.prev,
      orders.prev * aov.current,
      orders.current * aov.current
    );

    return buildShapleyContributions(
      {
        driver: "orders",
        explanation: `Orders effect on Revenue via Shapley decomposition (Revenue = Orders x AOV). ${INTERACTION_NOTE}`,
        prev: orders.prev,
        current: orders.current,
      },
      {
        driver: "aov",
        explanation: `AOV effect on Revenue via Shapley decomposition (Revenue = Orders x AOV). ${INTERACTION_NOTE}`,
        prev: aov.prev,
        current: aov.current,
      },
      shapley
    );
  }

  // --- AOV = Revenue / Orders -------------------------------------------
  if (normalized === "aov") {
    const revenue = await twoPeriodValues("revenue", period, filters);
    const orders = await twoPeriodValues("orders", period, filters);

    if (orders.prev <= 0 || orders.current <= 0) {
      return insufficientPair(
        { driver: "revenue", prev: revenue.prev, current: revenue.current },
        { driver: "orders", prev: orders.prev, current: orders.current },
        "Cannot decompose AOV when orders is zero in either period."
      );
    }

    const shapley = shapleyTwoFactorChange(
      revenue.prev / orders.prev,
      revenue.current / orders.prev,
      revenue.prev / orders.current,
      revenue.current / orders.current
    );

    return buildShapleyContributions(
      {
        driver: "revenue",
        explanation:
          "Revenue effect on AOV via Shapley decomposition (AOV = Revenue / Orders). The interaction effect is allocated between Revenue and Orders using Shapley attribution.",
        prev: revenue.prev,
        current: revenue.current,
      },
      {
        driver: "orders",
        explanation:
          "Orders effect on AOV via Shapley decomposition (AOV = Revenue / Orders). The interaction effect is allocated between Revenue and Orders using Shapley attribution.",
        prev: orders.prev,
        current: orders.current,
      },
      shapley
    );
  }

  // --- Marketing ROI = Attributed Revenue / Spend ------------------------
  if (normalized === "marketingroi" || normalized === "marketingROI") {
    const attributed = await twoPeriodValues("attributed_revenue", period, filters);
    const spend = await twoPeriodValues("marketing_spend", period, filters);

    if (spend.prev <= 0 || spend.current <= 0) {
      return insufficientPair(
        { driver: "attributed_revenue", prev: attributed.prev, current: attributed.current },
        { driver: "marketing_spend", prev: spend.prev, current: spend.current },
        "Cannot decompose Marketing ROI when marketing spend is zero in either period."
      );
    }

    const shapley = shapleyTwoFactorChange(
      attributed.prev / spend.prev,
      attributed.current / spend.prev,
      attributed.prev / spend.current,
      attributed.current / spend.current
    );

    return buildShapleyContributions(
      {
        driver: "attributed_revenue",
        explanation:
          "Attributed Revenue effect on Marketing ROI via Shapley decomposition (ROI = Attributed Revenue / Spend).",
        prev: attributed.prev,
        current: attributed.current,
      },
      {
        driver: "marketing_spend",
        explanation:
          "Marketing Spend effect on Marketing ROI via Shapley decomposition (ROI = Attributed Revenue / Spend).",
        prev: spend.prev,
        current: spend.current,
      },
      shapley
    );
  }

  // --- Conversion = Conversions / Sessions -------------------------------
  if (normalized === "conversion") {
    const conversion = await twoPeriodValues("conversion", period, filters);
    const sessions = await twoPeriodValues("conversion_traffic", period, filters);
    const mix = await twoPeriodValues("conversion_channel_mix", period, filters);

    // Conversion rate is not an algebraic product of the candidate drivers, so
    // these are reported as statistical rather than exact contributions.
    const rows: DriverContribution[] = [
      {
        driver: "conversion_traffic",
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: "statistical",
        change: sessions.current - sessions.prev,
        changePct: sessions.prev !== 0 ? ((sessions.current - sessions.prev) / sessions.prev) * 100 : null,
        status: "not_exactly_decomposable",
        explanation:
          "Session volume is associated with conversion rate through traffic quality, but is not an algebraic factor of it.",
      },
      {
        driver: "conversion_channel_mix",
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: "statistical",
        change: mix.current - mix.prev,
        changePct: mix.prev !== 0 ? ((mix.current - mix.prev) / mix.prev) * 100 : null,
        status: "not_exactly_decomposable",
        explanation:
          "Channel-mix index holds per-channel conversion fixed, so it moves only when session share moves between channels.",
      },
      {
        driver: "conversion_campaign_effectiveness",
        contributionPct: null,
        signedContributionPct: null,
        magnitudeContributionPct: null,
        contributionType: "statistical",
        change: 0,
        changePct: null,
        status: "not_exactly_decomposable",
        explanation:
          "Campaign efficiency (attributed revenue per unit spend) is associated with conversion but is measured on a different basis.",
      },
    ];

    const effectiveness = await twoPeriodValues("conversion_campaign_effectiveness", period, filters);
    rows[2].change = effectiveness.current - effectiveness.prev;
    rows[2].changePct =
      effectiveness.prev !== 0
        ? ((effectiveness.current - effectiveness.prev) / effectiveness.prev) * 100
        : null;

    void conversion;
    return rows;
  }

  // --- Orders: no exact algebraic decomposition available -----------------
  if (normalized === "orders") {
    const conversion = await twoPeriodValues("conversion", period, filters);
    const sessions = await twoPeriodValues("sessions", period, filters);
    const availability = await twoPeriodValues("availability", period, filters);

    const mk = (
      driver: string,
      v: { prev: number; current: number },
      explanation: string
    ): DriverContribution => ({
      driver,
      contributionPct: null,
      signedContributionPct: null,
      magnitudeContributionPct: null,
      contributionType: "statistical",
      change: v.current - v.prev,
      changePct: v.prev !== 0 ? ((v.current - v.prev) / v.prev) * 100 : null,
      status: "not_exactly_decomposable",
      explanation,
    });

    return [
      mk(
        "sessions",
        sessions,
        "Sessions come from marketing_daily, a different source and grain from the sales_transactions order count, so Orders cannot be exactly decomposed as Sessions x Conversion."
      ),
      mk(
        "conversion",
        conversion,
        "Marketing conversion rate measures conversions per session, not orders per session, so it is statistically associated with Orders rather than an algebraic component."
      ),
      mk(
        "availability",
        availability,
        "Availability constrains order completion but is not an algebraic factor of the order count."
      ),
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export async function calculateRegionContribution(
  metric: string,
  period: string,
  filters?: DriverFilters
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "region", filters);
}

export async function calculateProductContribution(
  metric: string,
  period: string,
  filters?: DriverFilters
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "product", filters);
}

export async function calculateChannelContribution(
  metric: string,
  period: string,
  filters?: DriverFilters
): Promise<DimensionContribution[]> {
  return calculateDimensionContribution(metric, period, "channel", filters);
}
