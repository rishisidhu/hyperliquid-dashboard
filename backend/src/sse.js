// SSE fan-out (SPEC §6). One poller feeds the cache; the cache emits "update";
// we broadcast the full snapshot to every connected client (full-snapshot
// payload chosen over deltas — SPEC §12 decision). Includes the §8.5 DoS
// guards seeded early: hard client cap (-> 503) and heartbeat to drop dead
// sockets.

import { config } from './config.js';
import { cache } from './cache.js';

export class SseHub {
  constructor() {
    this.clients = new Set(); // Set<ServerResponse>
    this.heartbeat = null;
    this.onUpdate = (snapshot) => this.broadcast(snapshot);
  }

  start() {
    cache.on('update', this.onUpdate);
    this.heartbeat = setInterval(() => this.#ping(), config.sseHeartbeatMs);
    this.heartbeat.unref?.();
  }

  stop() {
    cache.off('update', this.onUpdate);
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  get count() {
    return this.clients.size;
  }

  /**
   * Attach an SSE client. Returns false (and does NOT register) if the hard cap
   * is hit, so the caller can reply 503 (SPEC §8.5). On success, sends the
   * current snapshot immediately so a fresh client isn't blank until next poll.
   */
  addClient(req, res) {
    if (this.clients.size >= config.maxSseClients) {
      return false;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Defence in depth; nginx also sets this in production (SPEC §8).
      'X-Accel-Buffering': 'no',
    });
    // Advise client reconnect cadence.
    res.write('retry: 3000\n\n');

    this.clients.add(res);

    // Send last-known state right away if we have it.
    const snap = cache.snapshot();
    if (snap.board) this.#send(res, snap);

    const drop = () => {
      this.clients.delete(res);
    };
    req.on('close', drop);
    req.on('error', drop);
    res.on('error', drop);
    return true;
  }

  broadcast(snapshot) {
    const frame = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of this.clients) {
      // writableEnded guards against racing a just-closed socket.
      if (!res.writableEnded) res.write(frame);
    }
  }

  #send(res, snapshot) {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  }

  // Comment-line heartbeat keeps intermediaries from closing idle streams and
  // surfaces dead sockets (write triggers 'error'/'close', pruning the set).
  #ping() {
    for (const res of this.clients) {
      if (!res.writableEnded) res.write(': ping\n\n');
    }
  }
}
