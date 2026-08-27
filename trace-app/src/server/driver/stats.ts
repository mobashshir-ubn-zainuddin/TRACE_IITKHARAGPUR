/**
 * Statistical primitives for Module 3.
 *
 * Self-contained and dependency-free, but numerically careful: the p-value uses
 * a Lentz continued-fraction evaluation of the regularised incomplete beta
 * function rather than a normal approximation, which matters because the
 * driver histories here have small n (typically 10-17 monthly observations)
 * where the normal approximation is poor.
 */

/** Pearson product-moment correlation. Returns null when undefined (n<3 or zero variance). */
export function pearsonCorrelation(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 3) return null;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  // A constant series has no correlation defined -- returning 0 would be a lie.
  if (sxx <= 0 || syy <= 0) return null;

  const r = sxy / Math.sqrt(sxx * syy);
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

/** Mid-ranks, averaging ties (required for a correct Spearman under ties). */
export function rankWithTies(values: number[]): number[] {
  const n = values.length;
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j + 2) / 2; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation (Pearson on mid-ranks). */
export function spearmanCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  return pearsonCorrelation(rankWithTies(x), rankWithTies(y));
}

// ---------------------------------------------------------------------------
// Student t distribution
// ---------------------------------------------------------------------------

/** Lanczos log-gamma. Accurate to ~15 significant digits for x > 0. */
function logGamma(x: number): number {
  const g = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  const xx = x;
  let y = x;
  let tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / xx);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITER = 300;
  const EPS = 3e-16;
  const FPMIN = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    // even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    // odd step
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );

  // The continued fraction converges quickly only on one side; use the symmetry
  // I_x(a,b) = 1 - I_{1-x}(b,a) otherwise.
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x)
  ) * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p-value for a Student t statistic.
 *   P(|T| > |t|) = I_{df/(df+t^2)}(df/2, 1/2)
 */
export function studentTTwoTailedP(t: number, df: number): number | null {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return null;
  const x = df / (df + t * t);
  const p = incompleteBeta(df / 2, 0.5, x);
  if (!Number.isFinite(p)) return null;
  return Math.min(1, Math.max(0, p));
}

/**
 * Two-tailed p-value for a correlation coefficient under H0: rho = 0.
 *
 *   t  = r * sqrt((n - 2) / (1 - r^2))
 *   df = n - 2
 *
 * NOTE ON INTERPRETATION: a small p-value is evidence against the null of zero
 * LINEAR ASSOCIATION under the test's assumptions. It is NOT evidence of
 * causation, and does not establish direction of effect.
 */
export function correlationPValue(r: number, n: number): number | null {
  if (!Number.isFinite(r) || n < 3) return null;
  const df = n - 2;
  if (df <= 0) return null;

  // Perfect correlation: t is infinite, p is 0.
  const r2 = r * r;
  if (r2 >= 1) return 0;

  const t = r * Math.sqrt(df / (1 - r2));
  return studentTTwoTailedP(t, df);
}

/** t statistic corresponding to a correlation coefficient. */
export function correlationTStatistic(r: number, n: number): number | null {
  if (!Number.isFinite(r) || n < 3) return null;
  const df = n - 2;
  const r2 = r * r;
  if (r2 >= 1) return Infinity * Math.sign(r);
  return r * Math.sqrt(df / (1 - r2));
}

// ---------------------------------------------------------------------------
// Movement series
// ---------------------------------------------------------------------------

export interface MovementPoint {
  period: string;
  deltaPct: number;
}

/**
 * Convert a level series into a period-over-period percentage-change series.
 *
 *   deltaPct_t = ((X_t - X_{t-1}) / X_{t-1}) * 100
 *
 * Correlating raw levels is misleading here: two series that both trend upward
 * over 18 months correlate strongly regardless of whether they move *together*.
 * The movement series answers the question actually being asked -- "did the
 * driver move when the KPI moved?".
 *
 * Observations are emitted only where both endpoints have real data and the
 * denominator is non-zero; the rest are dropped rather than zero-filled.
 */
export function toMovementSeries(
  periods: Array<{ period: string; value: number; hasData: boolean }>
): MovementPoint[] {
  const out: MovementPoint[] = [];
  for (let i = 1; i < periods.length; i++) {
    const prev = periods[i - 1];
    const curr = periods[i];
    if (!prev.hasData || !curr.hasData) continue;
    if (prev.value === 0) continue;
    const deltaPct = ((curr.value - prev.value) / prev.value) * 100;
    if (!Number.isFinite(deltaPct)) continue;
    out.push({ period: curr.period, deltaPct });
  }
  return out;
}

/** Intersect two movement series on their shared periods, preserving order. */
export function alignMovementSeries(
  a: MovementPoint[],
  b: MovementPoint[]
): { periods: string[]; x: number[]; y: number[] } {
  const bMap = new Map(b.map((p) => [p.period, p.deltaPct]));
  const periods: string[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a) {
    const other = bMap.get(p.period);
    if (other === undefined) continue;
    periods.push(p.period);
    x.push(p.deltaPct);
    y.push(other);
  }
  return { periods, x, y };
}
