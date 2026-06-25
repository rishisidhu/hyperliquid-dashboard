// On-demand funding-history sparkline data (SPEC §4.4). Fetched per coin when a
// row is expanded, cached a few minutes — Hyperliquid serves the history, so we
// keep none of our own (no persistence).
//
// Fan-out + safety:
//   - Per-coin cache (TTL): repeated expands of a popular coin trigger ~one
//     upstream fetch per window, not one per browser.
//   - In-flight dedupe: concurrent first-requests for the same coin share a
//     single upstream call.
//   - SECURITY (§8.5): the caller (server route) MUST validate `coin` against
//     the universe allow-list before calling get(); we still never forward
//     anything but a known coin name.

import { config } from './config.js';
import { fetchFundingHistory } from './hlClient.js';

const HOURS_PER_YEAR = 24 * 365;

// Raw HL hourly history -> sparkline points (annualized %, consistent with the
// board). Pure; exported for testing.
export function deriveFundingHistory(raw) {
  return raw
    .map((p) => {
      const rate = parseFloat(p.fundingRate);
      const time = Number(p.time);
      if (!Number.isFinite(rate) || !Number.isFinite(time)) return null;
      return { time, annualizedPct: rate * HOURS_PER_YEAR * 100 };
    })
    .filter(Boolean);
}

export class FundingHistoryService {
  /**
   * @param {() => number} now  injectable clock for tests
   * @param {(coin:string, startTime:number)=>Promise<any[]>} fetcher  upstream
   *   fetch (injectable for tests; defaults to the real hlClient call)
   */
  constructor(now = () => Date.now(), fetcher = fetchFundingHistory) {
    this.now = now;
    this.fetcher = fetcher;
    this.cache = new Map(); // coin -> { points, cachedAt }
    this.inflight = new Map(); // coin -> Promise<points>
  }

  /**
   * Get sparkline points for a (pre-validated) coin. Serves fresh cache, else
   * fetches once (deduped). Returns { coin, points, cachedAt }.
   */
  async get(coin) {
    const t = this.now();
    const hit = this.cache.get(coin);
    if (hit && t - hit.cachedAt < config.fundingHistoryTtlMs) {
      return { coin, points: hit.points, cachedAt: hit.cachedAt };
    }
    let pending = this.inflight.get(coin);
    if (!pending) {
      pending = this.#fetch(coin).finally(() => this.inflight.delete(coin));
      this.inflight.set(coin, pending);
    }
    const points = await pending;
    const entry = this.cache.get(coin) ?? { points, cachedAt: this.now() };
    return { coin, points: entry.points, cachedAt: entry.cachedAt };
  }

  async #fetch(coin) {
    const startTime = this.now() - config.fundingHistoryLookbackHours * 3600 * 1000;
    const raw = await this.fetcher(coin, startTime);
    const points = deriveFundingHistory(raw);
    this.cache.set(coin, { points, cachedAt: this.now() });
    return points;
  }
}
