// Centralised configuration. Reads from process.env with safe defaults.
// A tiny optional .env loader keeps us zero-dependency (no dotenv).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Best-effort .env load: only fills vars that aren't already set in the
// environment (real env always wins). Silent if the file is absent.
function loadDotEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] === undefined) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    /* no .env file — fine */
  }
}

loadDotEnv();

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

function floatEnv(name, fallback) {
  const v = parseFloat(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

// Never let the poll interval drop below this floor, regardless of env, so a
// misconfiguration can't hammer Hyperliquid and get our IP rate-limited
// (SPEC §8.5: nothing may risk a ban). The exact upstream budget is treated
// as approximate; the margin is what matters.
const MIN_POLL_INTERVAL_MS = 1000;

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: intEnv('PORT', 8080),
  pollIntervalMs: Math.max(intEnv('POLL_INTERVAL_MS', 2000), MIN_POLL_INTERVAL_MS),
  maxSseClients: intEnv('MAX_SSE_CLIENTS', 200),
  sseHeartbeatMs: intEnv('SSE_HEARTBEAT_MS', 15000),

  // Hyperliquid public Info API. Read-only, no key (SPEC §5.2).
  hlInfoUrl: 'https://api.hyperliquid.xyz/info',
  // Bound the upstream request so a hung connection can't pile up.
  hlRequestTimeoutMs: 10000,

  // --- Phase 2: OI-snapshot persistence (SPEC §5.1) -----------------------
  // SQLite file lives in its own directory owned by the service user (§8.5).
  // Default is project-local ./data so it's never near blog data dirs.
  oiDbPath: process.env.OI_DB_PATH || join(__dirname, '..', 'data', 'oi.sqlite'),
  // How often we append one OI sample per coin (SPEC §5.1: 30–60s).
  oiSnapshotIntervalMs: intEnv('OI_SNAPSHOT_INTERVAL_MS', 60000),
  // Prune snapshots older than this (~1h, SPEC §5.1) to bound the file.
  oiRetentionMs: intEnv('OI_RETENTION_MS', 3600000),
  // Trend window: compare OI now vs ~this long ago (SPEC §4.2: 15–30 min).
  oiTrendWindowMs: intEnv('OI_TREND_WINDOW_MS', 1200000),
  // Below this |%| change the trend reads "flat" (noise deadband).
  oiTrendDeadbandPct: floatEnv('OI_TREND_DEADBAND_PCT', 1.0),

  // Board SIGNIFICANCE floor ($1M): "is this a real market?" Shared by the
  // frontend hide-balanced filter (emitted in the board payload as oiFloorUsd).
  oiFloorUsd: floatEnv('OI_FLOOR_USD', 1_000_000),
  // HEADLINE floor ($10M): higher, so marquee cards showcase liquid, credible
  // crowding (ADA/TRUMP-class) rather than $2–4M froth (SPEC §12, Phase 7).
  headlineOiFloorUsd: floatEnv('HEADLINE_OI_FLOOR_USD', 10_000_000),

  // --- Phase 5: cross-venue funding + funding-history sparklines ----------
  // Cross-venue poll cadence. Funding is hourly, so polling slowly is plenty
  // (SPEC §4.3) — no need to hammer Hyperliquid.
  predictedFundingsIntervalMs: intEnv('PREDICTED_FUNDINGS_INTERVAL_MS', 60000),
  // Per-coin funding-history cache TTL — serve repeated expands from cache so a
  // popular coin triggers ~one upstream fetch per window (SPEC §4.4 fan-out).
  fundingHistoryTtlMs: intEnv('FUNDING_HISTORY_TTL_MS', 300000),
  // How far back the sparkline reaches (hourly samples from Hyperliquid).
  fundingHistoryLookbackHours: intEnv('FUNDING_HISTORY_LOOKBACK_HOURS', 168),

  // --- Phase 7: OI-cap flags ----------------------------------------------
  // perpsAtOpenInterestCap poll cadence. The capped set changes slowly.
  oiCapIntervalMs: intEnv('OI_CAP_INTERVAL_MS', 45000),
};
