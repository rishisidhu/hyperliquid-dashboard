// Pure derivation: raw Hyperliquid [meta, ctxs] -> the dashboard board model.
// No I/O here so it stays trivially testable.

// --- Provisional crowd-skew thresholds (annualized funding, %). -------------
// These are PLACEHOLDERS pending inspection of the live funding distribution
// (SPEC §12 open question — intentionally left open). Tune against real data
// later; do not treat these numbers as settled.
const SKEW_BALANCED_MAX = 5; // |annualized %| below this => "Balanced"
const SKEW_EXTREME_MIN = 50; // |annualized %| above this => "extreme" intensity

// Hourly funding rate -> annualized percent. SPEC §4.2: funding × 24 × 365.
const HOURS_PER_YEAR = 24 * 365;

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Classify crowd skew from annualized funding.
 * Positive funding => longs pay shorts => the crowd leans long (SPEC §3).
 * Returns { label, side, intensity } where intensity 0..1 scales colour.
 */
export function crowdSkew(annualizedPct) {
  if (annualizedPct == null) {
    return { label: 'Unknown', side: 'none', intensity: 0 };
  }
  const mag = Math.abs(annualizedPct);
  // 0 at the balanced edge, 1 at the extreme edge; clamped.
  const intensity = Math.min(
    1,
    Math.max(0, (mag - SKEW_BALANCED_MAX) / (SKEW_EXTREME_MIN - SKEW_BALANCED_MAX)),
  );
  if (mag < SKEW_BALANCED_MAX) {
    return { label: 'Balanced', side: 'none', intensity: 0 };
  }
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
 * Headline strip (SPEC §4.1): most crowded longs / shorts.
 * Weighted by open interest so a tiny coin with extreme funding can't dominate
 * (SPEC §12 recommendation: funding × OI). Score = annualizedFunding × oiNotional.
 */
export function deriveHeadlines(rows, topN = 5) {
  const scored = rows
    .filter((r) => r.annualizedFundingPct != null && r.oiNotional != null)
    .map((r) => ({ ...r, crowdScore: r.annualizedFundingPct * r.oiNotional }));

  const longs = scored
    .filter((r) => r.crowdScore > 0)
    .sort((a, b) => b.crowdScore - a.crowdScore)
    .slice(0, topN);

  const shorts = scored
    .filter((r) => r.crowdScore < 0)
    .sort((a, b) => a.crowdScore - b.crowdScore)
    .slice(0, topN);

  return { mostCrowdedLongs: longs, mostCrowdedShorts: shorts };
}

/**
 * Full board model from a raw { meta, ctxs } snapshot.
 * universe[i] is parallel-indexed with ctxs[i].
 */
export function deriveBoard({ meta, ctxs }) {
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
    headlines: deriveHeadlines(rows),
    coinCount: rows.length,
  };
}
