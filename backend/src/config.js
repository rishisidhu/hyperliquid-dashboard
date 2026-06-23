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
};
