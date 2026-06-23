// Periodic OI-snapshot writer + in-memory trend reference (SPEC §5.1).
// Runs ~every OI_SNAPSHOT_INTERVAL_MS: appends one OI sample per coin to SQLite,
// prunes old rows, and refreshes the reference map the poller reads on the hot
// path. The reference is the latest sample at/before (now - trend window), so a
// ~snapshot-interval staleness is negligible against the 15–30 min window.

import { config } from './config.js';
import { cache } from './cache.js';
import { OiStore } from './oiStore.js';

export class Snapshotter {
  constructor(store = new OiStore(config.oiDbPath)) {
    this.store = store;
    this.timer = null;
    this.refMap = new Map(); // Map<coin, {oiNotional, ts}>
  }

  start() {
    // Prime the reference from persisted history immediately so trends work
    // right after a restart (the whole reason we persist — SPEC §5.1).
    this.#refreshReference(Date.now());
    this.timer = setInterval(() => this.#tick(), config.oiSnapshotIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.store.close();
  }

  /** Reference sample for a coin, or undefined if none old enough (warming). */
  getReference(coin) {
    return this.refMap.get(coin);
  }

  #tick() {
    const board = cache.snapshot().board;
    if (!board) return; // no successful poll yet — nothing to record
    const now = Date.now();
    const samples = board.rows.map((r) => ({ coin: r.coin, oiNotional: r.oiNotional }));
    try {
      this.store.record(samples, now, config.oiRetentionMs);
      this.#refreshReference(now);
    } catch (err) {
      console.error(`[snapshotter] ${err.message}`);
    }
  }

  #refreshReference(now) {
    try {
      this.refMap = this.store.referenceMap(now - config.oiTrendWindowMs);
    } catch (err) {
      console.error(`[snapshotter] reference refresh: ${err.message}`);
    }
  }
}
