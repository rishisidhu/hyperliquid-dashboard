// Board density ranking (SPEC §12, Phase 7 — "relevance ≠ skew").
// The default view must never drop a large market just because it's balanced.
// So the visible Top-N is a guarantee-based blend, not pure skew:
//   1. always include the top markets by OI (a fraction of the slots),
//   2. fill the rest by crowd intensity desc,
//   3. dedup, cap at N.
// Explainable per row ("it's here because it's one of the biggest markets" OR
// "because it's one of the most crowded") — preferred over an opaque additive
// score.
//
// Authored as .mjs with JSDoc types (not .ts) so it's unit-testable directly
// under `node --test` with zero extra deps; the TS app imports it fully typed
// via allowJs + JSDoc.

/** @typedef {import('./types').BoardRow} BoardRow */
/** @typedef {10 | 25 | 50 | "all"} TopN */

// Fraction of slots guaranteed to the largest markets by OI.
const OI_GUARANTEE_FRAC = 0.4;

/** @param {BoardRow} r */
function intensityOf(r) {
  return r.skew.side === "none" ? 0 : r.skew.intensity;
}
/** @param {BoardRow} r */
function oiOf(r) {
  return r.oiNotional ?? -1;
}

/**
 * Hide-balanced filter (opt-in). Drops only markets that are balanced AND below
 * the significance floor — big balanced markets (e.g. ETH) stay visible.
 * @param {BoardRow[]} rows
 * @param {boolean} hideBalanced
 * @param {number} oiFloorUsd
 * @returns {BoardRow[]}
 */
export function applyHideBalanced(rows, hideBalanced, oiFloorUsd) {
  if (!hideBalanced) return rows;
  return rows.filter((r) => r.skew.side !== "none" || oiOf(r) >= oiFloorUsd);
}

/**
 * Select the visible set for a curated Top-N view. "all" returns everything
 * (complete-market credibility — exempt from the floor).
 *
 * For a numeric N, the candidate pool is first filtered to "real markets"
 * (OI ≥ oiFloorUsd) so the curated board NEVER pulls in a sub-floor micro-cap —
 * not via the top-OI guarantee, and not via the intensity-fill path. Then:
 * guarantee top-OI markets, fill the rest by intensity, dedup. The $1M floor
 * thus consistently means "is this a real market?" for the curated view.
 *
 * NOTE: search bypasses this entirely (the caller skips selectTopN while
 * searching), so any coin — including sub-floor ones — stays findable.
 *
 * @param {BoardRow[]} rows
 * @param {TopN} topN
 * @param {number} [oiFloorUsd] significance floor for the curated view (0 = none)
 * @returns {BoardRow[]}
 */
export function selectTopN(rows, topN, oiFloorUsd = 0) {
  if (topN === "all") return rows; // All: unfiltered, shows sub-floor markets too

  const eligible = oiFloorUsd > 0 ? rows.filter((r) => oiOf(r) >= oiFloorUsd) : rows;
  if (eligible.length <= topN) return eligible;

  const guaranteeCount = Math.ceil(topN * OI_GUARANTEE_FRAC);
  const topByOi = [...eligible].sort((a, b) => oiOf(b) - oiOf(a)).slice(0, guaranteeCount);
  const byIntensity = [...eligible].sort((a, b) => intensityOf(b) - intensityOf(a));

  /** @type {BoardRow[]} */
  const picked = [];
  const seen = new Set();
  /** @param {BoardRow} r */
  const take = (r) => {
    if (picked.length < topN && !seen.has(r.coin)) {
      seen.add(r.coin);
      picked.push(r);
    }
  };
  topByOi.forEach(take); // biggest real markets always present
  byIntensity.forEach(take); // then the most crowded real markets
  return picked;
}
