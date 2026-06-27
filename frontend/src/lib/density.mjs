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
 * Select the visible set for a Top-N view. "all" returns everything.
 * Guarantee top-OI markets, then fill by intensity. Order here is not final —
 * the caller re-sorts by the active column.
 * @param {BoardRow[]} rows
 * @param {TopN} topN
 * @returns {BoardRow[]}
 */
export function selectTopN(rows, topN) {
  if (topN === "all" || rows.length <= topN) return rows;

  const guaranteeCount = Math.ceil(topN * OI_GUARANTEE_FRAC);
  const topByOi = [...rows].sort((a, b) => oiOf(b) - oiOf(a)).slice(0, guaranteeCount);
  const byIntensity = [...rows].sort((a, b) => intensityOf(b) - intensityOf(a));

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
  topByOi.forEach(take); // biggest markets always present
  byIntensity.forEach(take); // then the most crowded
  return picked;
}
