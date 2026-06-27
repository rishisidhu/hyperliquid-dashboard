// Single upstream poller (SPEC §6: one connection regardless of client count).
// REST-poll approach for Phase 1 (WS swap deferred). Self-scheduling timer with
// exponential backoff on failure so a Hyperliquid blip can't turn into a tight
// retry loop that hammers their API (SPEC §8.5).

import { config } from './config.js';
import { fetchMetaAndAssetCtxs } from './hlClient.js';
import { deriveBoard } from './derive.js';
import { computeOiTrend } from './trend.js';
import { cache } from './cache.js';

const MAX_BACKOFF_MS = 60000;

export class Poller {
  /**
   * @param {{getReference?: (coin:string)=>{oiNotional:number,ts:number}|undefined}} [opts]
   *   Optional trend reference source (the snapshotter). If absent, rows keep
   *   oiTrend:null (Phase-1 behaviour).
   */
  constructor({ trendSource } = {}) {
    this.timer = null;
    this.running = false;
    this.backoffMs = 0; // 0 = healthy; grows on consecutive failures
    this.trendSource = trendSource || null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#tick();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async #tick() {
    if (!this.running) return;
    try {
      const raw = await fetchMetaAndAssetCtxs();
      const board = deriveBoard(raw, {
        oiFloorUsd: config.oiFloorUsd,
        headlineFloorUsd: config.headlineOiFloorUsd,
        cappedCoins: cache.cappedCoins,
      });
      this.#enrichTrend(board);
      cache.set(board);
      this.backoffMs = 0; // recovered
    } catch (err) {
      cache.markError(err.message);
      // Grow backoff: poll interval -> 2x -> 4x ... capped. Serve stale cache
      // meanwhile (cache already retains last-known board).
      this.backoffMs = Math.min(
        this.backoffMs ? this.backoffMs * 2 : config.pollIntervalMs * 2,
        MAX_BACKOFF_MS,
      );
      console.error(`[poller] ${err.message} — retrying in ${this.backoffMs}ms`);
    } finally {
      this.#schedule();
    }
  }

  // Cheap hot-path enrichment: look up each coin's ~window-ago reference from
  // the snapshotter's in-memory map (no SQLite here) and derive the OI trend.
  #enrichTrend(board) {
    if (!this.trendSource) return;
    const now = Date.now();
    for (const row of board.rows) {
      const ref = this.trendSource.getReference(row.coin);
      row.oiTrend = computeOiTrend(row.oiNotional, ref, now, config.oiTrendDeadbandPct);
    }
  }

  #schedule() {
    if (!this.running) return;
    const delay = this.backoffMs || config.pollIntervalMs;
    this.timer = setTimeout(() => this.#tick(), delay);
    // Don't keep the event loop alive solely for the next poll.
    this.timer.unref?.();
  }
}
