// Thin read-only client for the Hyperliquid Info API.
//
// IMPORTANT (SPEC §8.5): this is the ONLY place the backend talks upstream, on
// our own fixed schedule. It accepts no user-supplied URL/host/params — the
// request body is a fixed literal. The backend must never become an open proxy.

import { config } from './config.js';

/**
 * Fetch the whole-market snapshot for all perps in one call.
 * Returns the raw [meta, assetCtxs] tuple (SPEC §5.2 metaAndAssetCtxs).
 * Throws on network error, timeout, non-2xx, or malformed shape.
 */
export async function fetchMetaAndAssetCtxs() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.hlRequestTimeoutMs);
  try {
    const res = await fetch(config.hlInfoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Fixed body — no pass-through of any caller input.
      body: '{"type":"metaAndAssetCtxs"}',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Hyperliquid responded ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length !== 2) {
      throw new Error('Unexpected metaAndAssetCtxs shape');
    }
    const [meta, ctxs] = data;
    if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
      throw new Error('Missing universe/ctxs in metaAndAssetCtxs');
    }
    return { meta, ctxs };
  } finally {
    clearTimeout(timer);
  }
}
