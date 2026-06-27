// In-memory market-state cache — the single source of truth (SPEC §6).
// A restart simply re-fetches the snapshot on the next poll, so no persistence
// is needed for the board itself (SPEC §5.1). Subscribers are notified on each
// successful update so the SSE layer can fan out without polling the cache.

import { EventEmitter } from 'node:events';

class MarketCache extends EventEmitter {
  constructor() {
    super();
    this.board = null; // latest derived board model
    this.updatedAt = null; // ms epoch of last successful update
    this.lastError = null; // last poll error message (for /health)
    this.stale = true; // true until the first successful poll
    this.coinSet = new Set(); // valid coin names (universe allow-list, §8.5)
    this.predicted = null; // { byCoin } cross-venue map (Phase 5)
    this.predictedUpdatedAt = null;
    this.cappedCoins = new Set(); // coins at their OI cap (Phase 7); read by the board poller
  }

  /** Update the OI-cap set (Phase 7). The next board build stamps rows from it. */
  setCappedCoins(coins) {
    this.cappedCoins = new Set(coins);
  }

  /** Store a fresh board and notify subscribers. */
  set(board) {
    this.board = board;
    this.updatedAt = Date.now();
    this.lastError = null;
    this.stale = false;
    // Refresh the coin allow-list used to validate the funding-history param.
    this.coinSet = new Set(board.rows.map((r) => r.coin));
    this.emit('update', this.snapshot());
  }

  /** Store fresh cross-venue predicted fundings and notify subscribers. */
  setPredicted(predicted) {
    this.predicted = predicted;
    this.predictedUpdatedAt = Date.now();
    this.emit('predicted-update', this.predictedSnapshot());
  }

  /** True if `coin` is a known market (universe allow-list). */
  isKnownCoin(coin) {
    return this.coinSet.has(coin);
  }

  /** Cross-venue view sent on the named `predicted` SSE event. */
  predictedSnapshot() {
    return {
      updatedAt: this.predictedUpdatedAt,
      byCoin: this.predicted?.byCoin ?? null,
    };
  }

  /** Record a poll failure; keep serving last-known data, marked stale. */
  markError(message) {
    this.lastError = message;
    this.stale = true;
  }

  /** Immutable view sent to clients and /health. */
  snapshot() {
    return {
      updatedAt: this.updatedAt,
      stale: this.stale,
      board: this.board,
    };
  }
}

export const cache = new MarketCache();
