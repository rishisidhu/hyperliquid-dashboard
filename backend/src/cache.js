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
  }

  /** Store a fresh board and notify subscribers. */
  set(board) {
    this.board = board;
    this.updatedAt = Date.now();
    this.lastError = null;
    this.stale = false;
    this.emit('update', this.snapshot());
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
