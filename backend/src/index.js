// Entry point — wires the poller, cache, SSE hub, and HTTP server together,
// binds to localhost, and shuts down cleanly.

import { config } from './config.js';
import { Poller } from './poller.js';
import { PredictedPoller } from './predictedPoller.js';
import { OiCapPoller } from './oiCapPoller.js';
import { SseHub } from './sse.js';
import { Snapshotter } from './snapshotter.js';
import { FundingHistoryService } from './fundingHistory.js';
import { createApp } from './server.js';

const snapshotter = new Snapshotter();
const poller = new Poller({ trendSource: snapshotter });
const predictedPoller = new PredictedPoller();
const oiCapPoller = new OiCapPoller();
const sseHub = new SseHub();
const fundingHistory = new FundingHistoryService();
const server = createApp(sseHub, fundingHistory);

snapshotter.start();
sseHub.start();
poller.start();
predictedPoller.start();
oiCapPoller.start();

server.listen(config.port, config.host, () => {
  console.log(
    `[server] listening on http://${config.host}:${config.port} ` +
      `(poll ${config.pollIntervalMs}ms, max ${config.maxSseClients} SSE clients)`,
  );
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} — shutting down`);
  poller.stop();
  predictedPoller.stop();
  oiCapPoller.stop();
  sseHub.stop();
  snapshotter.stop();
  server.close(() => process.exit(0));
  // Don't hang forever if a socket refuses to close.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
