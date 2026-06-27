// Slow poller for the open-interest-cap list (SPEC §4.2 OI-cap flag). The set of
// capped coins changes slowly, so ~45s is plenty. Fixed request body (no user
// input). Stores the set in the cache; the 2s board poller stamps each row's
// `atOiCap` from it (no extra payload — a boolean per row).

import { config } from './config.js';
import { fetchPerpsAtOpenInterestCap } from './hlClient.js';
import { cache } from './cache.js';

const MAX_BACKOFF_MS = 300000; // 5 min — not latency-sensitive

export class OiCapPoller {
  constructor() {
    this.timer = null;
    this.running = false;
    this.backoffMs = 0;
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
      const coins = await fetchPerpsAtOpenInterestCap();
      cache.setCappedCoins(coins);
      this.backoffMs = 0;
    } catch (err) {
      // Keep the last-known capped set; just log and back off.
      this.backoffMs = Math.min(
        this.backoffMs ? this.backoffMs * 2 : config.oiCapIntervalMs * 2,
        MAX_BACKOFF_MS,
      );
      console.error(`[oicap] ${err.message} — retrying in ${this.backoffMs}ms`);
    } finally {
      this.#schedule();
    }
  }

  #schedule() {
    if (!this.running) return;
    const delay = this.backoffMs || config.oiCapIntervalMs;
    this.timer = setTimeout(() => this.#tick(), delay);
    this.timer.unref?.();
  }
}
