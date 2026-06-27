// Thin read-only client for the Hyperliquid Info API.
//
// IMPORTANT (SPEC §8.5): the only place the backend talks upstream, on our own
// schedule. metaAndAssetCtxs and predictedFundings use FIXED bodies (no caller
// input). fundingHistory is the sole call that includes a coin — and its caller
// MUST validate that coin against the live universe allow-list first, so we
// never forward arbitrary user input. The backend must never become an open proxy.

import { config } from './config.js';

// Shared bounded POST to the Info API. `body` must be a pre-built string.
async function postInfo(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.hlRequestTimeoutMs);
  try {
    const res = await fetch(config.hlInfoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Hyperliquid responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the whole-market snapshot for all perps in one call.
 * Returns the raw [meta, assetCtxs] tuple (SPEC §5.2 metaAndAssetCtxs).
 * Throws on network error, timeout, non-2xx, or malformed shape.
 */
export async function fetchMetaAndAssetCtxs() {
  // Fixed body — no pass-through of any caller input.
  const data = await postInfo('{"type":"metaAndAssetCtxs"}');
  if (!Array.isArray(data) || data.length !== 2) {
    throw new Error('Unexpected metaAndAssetCtxs shape');
  }
  const [meta, ctxs] = data;
  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
    throw new Error('Missing universe/ctxs in metaAndAssetCtxs');
  }
  return { meta, ctxs };
}

/**
 * Cross-venue predicted fundings for every coin (SPEC §4.3). Fixed body — no
 * caller input. Returns the raw array of [coin, [[venue, info|null], ...]].
 */
export async function fetchPredictedFundings() {
  const data = await postInfo('{"type":"predictedFundings"}');
  if (!Array.isArray(data)) throw new Error('Unexpected predictedFundings shape');
  return data;
}

/**
 * Coins currently at their open-interest cap (SPEC §4.2 OI-cap flag). Fixed
 * body — no caller input. Returns the raw array of coin-name strings.
 */
export async function fetchPerpsAtOpenInterestCap() {
  const data = await postInfo('{"type":"perpsAtOpenInterestCap"}');
  return Array.isArray(data) ? data : [];
}

/**
 * Per-coin funding history since `startTime` (SPEC §4.4 sparkline).
 * SECURITY (§8.5): `coin` MUST already be validated against the universe by the
 * caller — this includes it in the upstream body. Returns the raw array (HL
 * returns null for an unknown coin; caller treats that as empty).
 */
export async function fetchFundingHistory(coin, startTime) {
  const data = await postInfo(
    JSON.stringify({ type: 'fundingHistory', coin, startTime }),
  );
  return Array.isArray(data) ? data : [];
}
