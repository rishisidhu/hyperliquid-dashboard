"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot, SkewSide } from "./types";

// Rolling client-side window of recent LIVE PREMIUM (mark vs oracle, %) samples,
// fed by each ~2s snapshot (no new endpoint — reuses the stream). Premium moves
// continuously tick-to-tick (unlike hourly funding, which looks flat over
// minutes) and is on-thesis: it's the real-time crowd-pressure signal funding
// lags. We track every coin, then expose the current top-5 by open interest.
// (Fallback metric, ready if premium reads too noisy live: normalized mid-price
// % change since the window opened — a small swap here + in the component.)

const WINDOW = 60; // ~2 minutes at a 2s cadence

export interface HeartbeatSeries {
  coin: string;
  values: number[]; // premium %, most recent last; up to WINDOW samples
  side: SkewSide; // current crowd lean (colours the line)
}

interface Entry {
  values: number[];
  oi: number;
  side: SkewSide;
}

export function useHeartbeat(snapshot: Snapshot | null): HeartbeatSeries[] {
  const seriesRef = useRef<Map<string, Entry>>(new Map());
  const lastTsRef = useRef<number | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    const board = snapshot?.board;
    if (!board || snapshot?.updatedAt === lastTsRef.current) return;
    lastTsRef.current = snapshot?.updatedAt ?? null;

    const m = seriesRef.current;
    for (const r of board.rows) {
      const p = r.premium;
      if (p == null || !Number.isFinite(p)) continue;
      const e = m.get(r.coin) ?? { values: [], oi: 0, side: "none" as SkewSide };
      e.values.push(p * 100); // ratio → percent
      if (e.values.length > WINDOW) e.values.shift();
      e.oi = r.oiNotional ?? e.oi;
      e.side = r.skew.side;
      m.set(r.coin, e);
    }
    bump((v) => v + 1); // re-render so the chart redraws this tick
  }, [snapshot]);

  // Current top-5 by OI among tracked coins.
  return [...seriesRef.current.entries()]
    .filter(([, e]) => e.oi > 0)
    .sort((a, b) => b[1].oi - a[1].oi)
    .slice(0, 5)
    .map(([coin, e]) => ({ coin, values: e.values, side: e.side }));
}
