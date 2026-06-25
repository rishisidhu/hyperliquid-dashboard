// Pure derivation: raw Hyperliquid [meta, ctxs] -> the dashboard board model.
// No I/O here so it stays trivially testable.

// --- Crowd-skew intensity scale (annualized funding, %). --------------------
// LOG scale (SPEC §12, resolved 2026-06-25). Hyperliquid funding is NOT clamped
// near ±11% — it's effectively unbounded (observed past ±700%), with a long thin
// tail. A linear cut-off at ±50% saturated that whole tail to intensity 1.0,
// blinding both the pip ramp and the headline ranking. A log map keeps the
// common 10–50% range AND the extreme tail visually distinct, with FIXED anchors
// (stable + comparable over time, unlike a percentile/rank scale).
//   |ann%| < BALANCED_ANN_PCT        => Balanced (intensity 0, neutral axis tick)
//   intensity = (log10(mag) − log10(LO)) / (log10(HI) − log10(LO)), clamped 0..1
const BALANCED_ANN_PCT = 5; // below this => "Balanced"
const EXTREME_ANN_PCT = 700; // at/above this => intensity 1.0 (covers observed max)
const LOG_LO = Math.log10(BALANCED_ANN_PCT);
const LOG_HI = Math.log10(EXTREME_ANN_PCT);

// Minimum OI notional ($) for a market to be "significant" — used as the
// headline eligibility floor here, and shared with the Phase-7 board-density
// filter. Overridable per deploy (poller passes config.oiFloorUsd).
const DEFAULT_OI_FLOOR_USD = 1_000_000;

// Hourly funding rate -> annualized percent. SPEC §4.2: funding × 24 × 365.
const HOURS_PER_YEAR = 24 * 365;

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Classify crowd skew from annualized funding.
 * Positive funding => longs pay shorts => the crowd leans long (SPEC §3).
 * Returns { label, side, intensity } where intensity 0..1 (log) scales colour.
 */
export function crowdSkew(annualizedPct) {
  if (annualizedPct == null) {
    return { label: 'Unknown', side: 'none', intensity: 0 };
  }
  const mag = Math.abs(annualizedPct);
  if (mag < BALANCED_ANN_PCT) {
    return { label: 'Balanced', side: 'none', intensity: 0 };
  }
  // Log map between the balanced edge and the extreme anchor; clamp beyond HI.
  const intensity = Math.min(
    1,
    Math.max(0, (Math.log10(mag) - LOG_LO) / (LOG_HI - LOG_LO)),
  );
  return annualizedPct > 0
    ? { label: 'Longs crowded', side: 'long', intensity }
    : { label: 'Shorts crowded', side: 'short', intensity };
}

/**
 * Build one board row from a universe entry and its parallel-indexed ctx.
 * Returns null for entries with no usable context (e.g. delisted).
 */
export function deriveRow(uni, ctx) {
  if (!ctx) return null;
  const markPx = num(ctx.markPx);
  const funding = num(ctx.funding); // hourly rate
  const openInterest = num(ctx.openInterest); // base units
  const prevDayPx = num(ctx.prevDayPx);

  const annualizedFundingPct = funding == null ? null : funding * HOURS_PER_YEAR * 100;
  const oiNotional = markPx != null && openInterest != null ? openInterest * markPx : null;
  const change24hPct =
    markPx != null && prevDayPx != null && prevDayPx !== 0
      ? ((markPx - prevDayPx) / prevDayPx) * 100
      : null;

  return {
    coin: uni.name,
    maxLeverage: uni.maxLeverage ?? null,
    markPx,
    change24hPct,
    funding, // raw hourly, for reference
    annualizedFundingPct,
    skew: crowdSkew(annualizedFundingPct),
    openInterest,
    oiNotional,
    dayNtlVlm: num(ctx.dayNtlVlm),
    premium: num(ctx.premium),
    oraclePx: num(ctx.oraclePx),
    midPx: num(ctx.midPx),
    // OI trend arrow is Phase 2 (needs stored snapshots); placeholder for now.
    oiTrend: null,
  };
}

/**
 * Headline strip (SPEC §4.1): most crowded longs / shorts. CANONICAL ranking —
 * the frontend consumes this rather than recomputing (single source of truth,
 * SPEC §12 reconciliation resolved 2026-06-25).
 *
 * R1: rank by |annualized %| desc among markets above a minimum-OI eligibility
 * floor (so an illiquid micro-market with extreme funding can't lead). Ranking
 * by the same number the card displays keeps each card internally consistent and
 * the "most one-sided book" superlative literally true. Tiebreak: OI desc, then
 * coin asc (deterministic — fixes the old intensity-tie input-order fallthrough).
 */
export function deriveHeadlines(rows, { oiFloorUsd = DEFAULT_OI_FLOOR_USD, topN = 5 } = {}) {
  const eligible = rows.filter(
    (r) =>
      r.annualizedFundingPct != null &&
      r.oiNotional != null &&
      r.oiNotional >= oiFloorUsd,
  );

  const byMagnitude = (a, b) => {
    const d = Math.abs(b.annualizedFundingPct) - Math.abs(a.annualizedFundingPct);
    if (d !== 0) return d;
    const oi = b.oiNotional - a.oiNotional; // OI desc
    if (oi !== 0) return oi;
    return a.coin.localeCompare(b.coin); // coin asc
  };

  const longs = eligible
    .filter((r) => r.skew.side === 'long')
    .sort(byMagnitude)
    .slice(0, topN);
  const shorts = eligible
    .filter((r) => r.skew.side === 'short')
    .sort(byMagnitude)
    .slice(0, topN);

  return { mostCrowdedLongs: longs, mostCrowdedShorts: shorts };
}

/**
 * Full board model from a raw { meta, ctxs } snapshot.
 * universe[i] is parallel-indexed with ctxs[i].
 * @param {{oiFloorUsd?: number}} [opts] headline eligibility floor (poller passes config).
 */
export function deriveBoard({ meta, ctxs }, opts = {}) {
  const rows = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const uni = meta.universe[i];
    // Skip delisted markets — Hyperliquid flags them in the universe entry.
    if (uni.isDelisted) continue;
    const row = deriveRow(uni, ctxs[i]);
    if (row) rows.push(row);
  }
  return {
    rows,
    headlines: deriveHeadlines(rows, { oiFloorUsd: opts.oiFloorUsd }),
    coinCount: rows.length,
  };
}
