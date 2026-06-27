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

// Two OI floors (SPEC §12, Phase 7 — "credibility of the hero vs completeness
// of the board"):
//   - SIGNIFICANCE floor ($1M): "is this a real market?" Shared by the board's
//     hide-balanced filter (frontend reads it from the payload). Emitted as
//     board.oiFloorUsd so there's one shared constant.
//   - HEADLINE floor ($10M): higher, so the marquee cards showcase liquid,
//     credible crowding (ADA/TRUMP-class) rather than $2–4M froth. A frothy
//     small-cap like IP ($4.5M) still appears on the board and in its own row,
//     just not as a headline hero unless it clears the headline floor.
// Both overridable per deploy (poller passes config values).
const DEFAULT_OI_FLOOR_USD = 1_000_000;
const DEFAULT_HEADLINE_OI_FLOOR_USD = 10_000_000;

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
 * @param {Set<string>} [cappedCoins] coins at their OI cap (Phase 7 badge).
 */
export function deriveRow(uni, ctx, cappedCoins) {
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
    // At its open-interest cap — no new positions can be opened (Phase 7).
    atOiCap: cappedCoins ? cappedCoins.has(uni.name) : false,
  };
}

/**
 * Headline strip (SPEC §4.1): most crowded longs / shorts. CANONICAL ranking —
 * the frontend consumes this rather than recomputing (single source of truth,
 * SPEC §12 reconciliation resolved 2026-06-25).
 *
 * R1: rank by |annualized %| desc among markets above the HEADLINE OI floor
 * ($10M — higher than the board significance floor, so heroes are liquid and
 * credible, not $2–4M froth). Ranking by the same number the card displays keeps
 * each card internally consistent and the "most one-sided book" superlative
 * literally true (we deliberately do NOT blend size in — that would break it).
 * Tiebreak: OI desc, then coin asc. On a quiet day where nothing clears the
 * floor, a side simply returns no hero; the frontend's superlative is also
 * intensity-gated, so a mild leader is never called "the most one-sided book".
 */
export function deriveHeadlines(
  rows,
  { headlineFloorUsd = DEFAULT_HEADLINE_OI_FLOOR_USD, topN = 5 } = {},
) {
  const eligible = rows.filter(
    (r) =>
      r.annualizedFundingPct != null &&
      r.oiNotional != null &&
      r.oiNotional >= headlineFloorUsd,
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
 * @param {object} [opts]
 * @param {number} [opts.oiFloorUsd]       board significance floor ($1M); emitted in the payload.
 * @param {number} [opts.headlineFloorUsd] headline eligibility floor ($10M).
 * @param {Set<string>} [opts.cappedCoins] coins at their OI cap (badge).
 */
export function deriveBoard({ meta, ctxs }, opts = {}) {
  const oiFloorUsd = opts.oiFloorUsd ?? DEFAULT_OI_FLOOR_USD;
  const rows = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const uni = meta.universe[i];
    // Skip delisted markets — Hyperliquid flags them in the universe entry.
    if (uni.isDelisted) continue;
    const row = deriveRow(uni, ctxs[i], opts.cappedCoins);
    if (row) rows.push(row);
  }
  return {
    rows,
    headlines: deriveHeadlines(rows, { headlineFloorUsd: opts.headlineFloorUsd }),
    coinCount: rows.length,
    // Shared significance floor — the frontend reads this for hide-balanced so
    // there's exactly one constant (SPEC §12).
    oiFloorUsd,
  };
}
