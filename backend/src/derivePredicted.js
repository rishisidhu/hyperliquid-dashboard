// Pure derivation of cross-venue predicted fundings (SPEC §4.3). No I/O.
//
// CORRECTNESS: venues quote funding over DIFFERENT intervals (Hyperliquid 1h,
// Binance/Bybit typically 8h), so the raw `fundingRate` values are NOT directly
// comparable. We annualize each by its own interval:
//   annualizedPct = rate × (24 / intervalHours) × 365 × 100
// Only then is "HL vs Binance vs Bybit" an apples-to-apples comparison.

const HOURS_PER_YEAR = 24 * 365;

// Hyperliquid venue codes → display names. Unknown codes pass through as-is.
const VENUE_NAMES = {
  HlPerp: 'Hyperliquid',
  BinPerp: 'Binance',
  BybitPerp: 'Bybit',
};

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Annualize a single venue's funding entry, or null if unusable. */
export function annualizeVenue(code, info) {
  if (!info) return null; // venue doesn't list this coin
  const rate = num(info.fundingRate);
  const interval = num(info.fundingIntervalHours);
  if (rate == null || interval == null || interval <= 0) return null;
  return {
    venue: VENUE_NAMES[code] || code,
    code,
    annualizedPct: rate * (HOURS_PER_YEAR / interval) * 100,
    intervalHours: interval,
    nextFundingTime: Number.isFinite(info.nextFundingTime)
      ? info.nextFundingTime
      : null,
  };
}

/**
 * Transform the raw predictedFundings array into a by-coin map of comparable,
 * annualized venue rates. Hyperliquid is sorted first when present.
 * @param {Array} raw  [[coin, [[venueCode, info|null], ...]], ...]
 * @returns {{byCoin: Record<string, {venues: object[]}>}}
 */
export function derivePredictedFundings(raw) {
  const byCoin = {};
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [coin, venueList] = entry;
    if (typeof coin !== 'string' || !Array.isArray(venueList)) continue;
    const venues = venueList
      .map(([code, info]) => annualizeVenue(code, info))
      .filter(Boolean);
    if (venues.length === 0) continue;
    // Hyperliquid first (it's our anchor), then the rest as given.
    venues.sort((a, b) => (a.code === 'HlPerp' ? -1 : b.code === 'HlPerp' ? 1 : 0));
    byCoin[coin] = { venues };
  }
  return { byCoin };
}
