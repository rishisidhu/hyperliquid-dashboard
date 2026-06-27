"use client";

import { useEffect, useState } from "react";
import type { Snapshot, PredictedFundings } from "./types";

// Backend SSE endpoint. In dev, run the backend with
// CORS_ORIGIN=http://localhost:3000 (SPEC §8.5 CORS lock). In prod this points
// at https://api.niminal.xyz/stream via NEXT_PUBLIC_STREAM_URL.
const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL || "http://127.0.0.1:8080/stream";
const BOARD_URL = STREAM_URL.replace(/\/stream$/, "") + "/board";

// If SSE stays down this long, fall back to polling /board so data keeps
// flowing; we resume the stream the moment it recovers.
const FALLBACK_GRACE_MS = 5000;
const FALLBACK_POLL_MS = 5000;

export interface StreamState {
  snapshot: Snapshot | null;
  predicted: PredictedFundings | null; // cross-venue map (separate event)
  connected: boolean; // true while the SSE stream is open
}

/**
 * Subscribe to the live board stream. EventSource auto-reconnects with backoff;
 * on top of that we add a REST fallback — if the stream stays down past a grace
 * period, poll GET /board every few seconds so the board never freezes, and
 * stop polling as soon as the stream recovers. One stream per client — the
 * backend fans out (SPEC §6). Also surfaces the cross-venue `predicted` event.
 */
export function useStream(): StreamState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [predicted, setPredicted] = useState<PredictedFundings | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stopped = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopFallback = () => {
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const pollOnce = async () => {
      try {
        const res = await fetch(BOARD_URL, { cache: "no-store" });
        if (!res.ok) return;
        if (!stopped) setSnapshot((await res.json()) as Snapshot);
      } catch {
        /* stay in fallback; try again next tick */
      }
    };

    // Start REST polling only after a grace period of being disconnected, so a
    // brief blip rides on EventSource's own reconnect without extra requests.
    const scheduleFallback = () => {
      if (graceTimer || pollTimer) return;
      graceTimer = setTimeout(() => {
        graceTimer = null;
        if (stopped) return;
        pollOnce();
        pollTimer = setInterval(pollOnce, FALLBACK_POLL_MS);
      }, FALLBACK_GRACE_MS);
    };

    const es = new EventSource(STREAM_URL);
    es.onopen = () => {
      setConnected(true);
      stopFallback();
    };
    es.onmessage = (e) => {
      try {
        setSnapshot(JSON.parse(e.data) as Snapshot);
        setConnected(true);
        stopFallback();
      } catch {
        /* ignore malformed frame */
      }
    };
    // Cross-venue fundings ride a named event so the 2s board frame stays lean.
    es.addEventListener("predicted", (e) => {
      try {
        setPredicted(JSON.parse((e as MessageEvent).data) as PredictedFundings);
      } catch {
        /* ignore malformed frame */
      }
    });
    es.onerror = () => {
      setConnected(false); // EventSource keeps retrying; arm the REST fallback
      scheduleFallback();
    };

    return () => {
      stopped = true;
      stopFallback();
      es.close();
    };
  }, []);

  return { snapshot, predicted, connected };
}

/** A ticking clock (ms) for relative "updated Ns ago" displays. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
