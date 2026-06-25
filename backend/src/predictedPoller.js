// Slow poller for cross-venue predicted fundings (SPEC §4.3). Separate from the
// 2s board poller because funding is hourly — ~60s is plenty and keeps the
// upstream footprint low. Fixed request body (no user input). Same self-
// scheduling + exponential-backoff shape as the main poller.

import { config } from './config.js';
import { fetchPredictedFundings } from './hlClient.js';
import { derivePredictedFundings } from './derivePredicted.js';
import { cache } from './cache.js';

const MAX_BACKOFF_MS = 300000; // 5 min — this stream isn't latency-sensitive

export class PredictedPoller {
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
      const raw = await fetchPredictedFundings();
      cache.setPredicted(derivePredictedFundings(raw));
      this.backoffMs = 0;
    } catch (err) {
      // Keep serving last-known cross-venue data; just log and back off.
      this.backoffMs = Math.min(
        this.backoffMs ? this.backoffMs * 2 : config.predictedFundingsIntervalMs * 2,
        MAX_BACKOFF_MS,
      );
      console.error(`[predicted] ${err.message} — retrying in ${this.backoffMs}ms`);
    } finally {
      this.#schedule();
    }
  }

  #schedule() {
    if (!this.running) return;
    const delay = this.backoffMs || config.predictedFundingsIntervalMs;
    this.timer = setTimeout(() => this.#tick(), delay);
    this.timer.unref?.();
  }
}
