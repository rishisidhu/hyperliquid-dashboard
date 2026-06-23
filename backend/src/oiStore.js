// SQLite persistence for rolling OI-notional snapshots (SPEC §5.1).
// Single-writer: only the snapshotter touches this (~every 60s), so it's off
// the 2s poll hot path. `ts` and retention/target times are passed in by the
// caller (not read from the clock here) to keep the store deterministic and
// unit-testable with an in-memory DB.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class OiStore {
  /** @param {string} dbPath  file path, or ':memory:' for tests */
  constructor(dbPath) {
    if (dbPath !== ':memory:') {
      // Own directory, owned by the service user (§8.5 isolation).
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    // WAL + NORMAL: OI samples aren't critical data; favour write throughput
    // on the shared box over maximum durability (SPEC §12 decision).
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oi_snapshots (
        coin        TEXT    NOT NULL,
        ts          INTEGER NOT NULL,
        oi_notional REAL    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oi_coin_ts ON oi_snapshots (coin, ts);
    `);

    this.insertStmt = this.db.prepare(
      'INSERT INTO oi_snapshots (coin, ts, oi_notional) VALUES (?, ?, ?)',
    );
    this.pruneStmt = this.db.prepare('DELETE FROM oi_snapshots WHERE ts < ?');
    // NOTE: relies on SQLite's "bare column" behaviour — when a query uses an
    // aggregate (MAX) with non-aggregated columns and no other aggregates, the
    // bare columns (coin, oi_notional) come from the SAME row that supplied the
    // MAX(ts). So this returns, per coin, the latest sample at/before the target
    // time. This is intentional and correct in SQLite (>=3.7.11); do NOT "fix"
    // it into a generic GROUP BY — that would break the row-matching guarantee.
    this.refStmt = this.db.prepare(
      'SELECT coin, MAX(ts) AS ts, oi_notional FROM oi_snapshots WHERE ts <= ? GROUP BY coin',
    );

    // Append all samples for one tick, then prune, atomically.
    this.recordTx = this.db.transaction((samples, ts, retentionMs) => {
      for (const s of samples) {
        if (s.oiNotional != null && Number.isFinite(s.oiNotional)) {
          this.insertStmt.run(s.coin, ts, s.oiNotional);
        }
      }
      this.pruneStmt.run(ts - retentionMs);
    });
  }

  /**
   * Append one OI sample per coin for timestamp `ts`, then prune anything older
   * than `retentionMs` before `ts`. Atomic.
   * @param {Array<{coin:string, oiNotional:number|null}>} samples
   */
  record(samples, ts, retentionMs) {
    this.recordTx(samples, ts, retentionMs);
  }

  /**
   * Reference map for trend: per coin, the latest sample at/before `targetTs`
   * (i.e. ~one trend-window ago). Coins with no sample that old are absent →
   * the trend reads "warming" for them.
   * @returns {Map<string, {oiNotional:number, ts:number}>}
   */
  referenceMap(targetTs) {
    const rows = this.refStmt.all(targetTs);
    const map = new Map();
    for (const r of rows) {
      map.set(r.coin, { oiNotional: r.oi_notional, ts: r.ts });
    }
    return map;
  }

  /** Total row count — for tests/diagnostics. */
  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM oi_snapshots').get().n;
  }

  close() {
    this.db.close();
  }
}
