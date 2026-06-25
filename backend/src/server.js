// HTTP server — the localhost-only face of the backend (SPEC §6, §8.5).
// nginx is the sole public door in production; this binds to 127.0.0.1.
// Routes (GET only): /stream (SSE), /health, /funding-history?coin=NAME.
//
// Full §8.5 hardening lands in Phase 8. Seeded here: GET-only, strict origin
// header, generic errors (no stack traces), no Server/version header.

import { createServer } from 'node:http';
import { config } from './config.js';
import { cache } from './cache.js';

// A coin param can only ever be a short ticker; reject obviously-bad input
// cheaply before even consulting the universe allow-list (defence in depth).
const COIN_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

// CORS locked to the dashboard origin (SPEC §8.5 item 3). Configurable so local
// dev can override, but defaults to the production frontend only — never '*'.
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || 'https://niminal.xyz';

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, body) {
  setCommonHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createApp(sseHub, fundingHistory) {
  const server = createServer((req, res) => {
    // Parse once; route on pathname, read params from the query.
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (path === '/health') {
      const snap = cache.snapshot();
      sendJson(res, 200, {
        status: 'ok',
        stale: snap.stale,
        updatedAt: snap.updatedAt,
        coinCount: snap.board?.coinCount ?? 0,
        sseClients: sseHub.count,
        lastError: cache.lastError,
      });
      return;
    }

    if (path === '/stream') {
      setCommonHeaders(res);
      const accepted = sseHub.addClient(req, res);
      if (!accepted) {
        // At capacity — shed load rather than starve the co-hosted blog.
        sendJson(res, 503, { error: 'capacity' });
      }
      return;
    }

    // On-demand funding-history sparkline. SECURITY (§8.5): the coin param is
    // validated against the live universe allow-list and never forwarded raw —
    // an unknown/malformed coin is rejected here, not proxied to Hyperliquid.
    if (path === '/funding-history') {
      const coin = url.searchParams.get('coin') || '';
      if (!COIN_PATTERN.test(coin) || !cache.isKnownCoin(coin)) {
        sendJson(res, 400, { error: 'unknown_coin' });
        return;
      }
      fundingHistory
        .get(coin)
        .then((data) => sendJson(res, 200, data))
        .catch(() => sendJson(res, 502, { error: 'upstream' }));
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });

  // Generic error surface — never leak stack traces (SPEC §8.5 item 4).
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  // Bound timeouts so slow/idle sockets can't pile up (DoS guard, §8.5).
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;

  return server;
}
