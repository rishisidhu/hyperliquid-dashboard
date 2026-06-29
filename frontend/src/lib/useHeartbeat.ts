"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot, SkewSide } from "./types";

// Rolling client-side window of recent signed annualized-funding samples, fed by
// each ~2s snapshot (no new endpoint — reuses the stream). We track every coin's
// recent funding, then expose the current top-5 by open interest. Membership can
// shift tick to tick; series persist so a coin re-entering keeps its history.

const WINDOW = 60; // ~2 minutes at a 2s cadence

export interface HeartbeatSeries {
  coin: string;
  funding: number[]; // most recent last; up to WINDOW samples
  side: SkewSide; // current lean (colours the line)
}

interface Entry {
  funding: number[];
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
      const f = r.annualizedFundingPct;
      if (f == null || !Number.isFinite(f)) continue;
      const e = m.get(r.coin) ?? { funding: [], oi: 0, side: "none" as SkewSide };
      e.funding.push(f);
      if (e.funding.length > WINDOW) e.funding.shift();
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
    .map(([coin, e]) => ({ coin, funding: e.funding, side: e.side }));
}
