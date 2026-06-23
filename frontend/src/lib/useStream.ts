"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "./types";

// Backend SSE endpoint. In dev, run the backend with
// CORS_ORIGIN=http://localhost:3000 (SPEC §8.5 CORS lock). In prod this points
// at https://api.niminal.xyz/stream via NEXT_PUBLIC_STREAM_URL.
const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL || "http://127.0.0.1:8080/stream";

export interface StreamState {
  snapshot: Snapshot | null;
  connected: boolean;
}

/**
 * Subscribe to the live board stream. EventSource handles reconnect-with-backoff
 * itself; we surface connection status and the latest full snapshot. One stream
 * per client — the backend fans out (SPEC §6).
 */
export function useStream(): StreamState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(STREAM_URL);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        setSnapshot(JSON.parse(e.data) as Snapshot);
        setConnected(true);
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => setConnected(false); // EventSource will auto-retry
    return () => es.close();
  }, []);

  return { snapshot, connected };
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
