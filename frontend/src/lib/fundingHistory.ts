// Client-side fetch helper for the on-demand funding-history sparkline.
// Caches per coin (the backend also caches/dedupes upstream, this just avoids
// re-fetching on repeated expand/collapse) and dedupes concurrent requests.

import type { FundingHistoryResponse } from "./types";

const BASE =
  process.env.NEXT_PUBLIC_STREAM_URL?.replace(/\/stream$/, "") ||
  "http://127.0.0.1:8080";

const CLIENT_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { data: FundingHistoryResponse; at: number }>();
const inflight = new Map<string, Promise<FundingHistoryResponse>>();

export async function getFundingHistory(
  coin: string,
): Promise<FundingHistoryResponse> {
  const hit = cache.get(coin);
  if (hit && Date.now() - hit.at < CLIENT_TTL_MS) return hit.data;

  let pending = inflight.get(coin);
  if (!pending) {
    pending = fetch(`${BASE}/funding-history?coin=${encodeURIComponent(coin)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`funding-history ${r.status}`);
        return r.json() as Promise<FundingHistoryResponse>;
      })
      .then((data) => {
        cache.set(coin, { data, at: Date.now() });
        return data;
      })
      .finally(() => inflight.delete(coin));
    inflight.set(coin, pending);
  }
  return pending;
}
