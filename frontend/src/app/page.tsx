"use client";

import { useMemo, useState } from "react";
import { useStream, useNow } from "@/lib/useStream";
import { hlItem, interp } from "@/lib/viewModel";
import { TopBar } from "@/components/TopBar";
import { HeadlineStrip } from "@/components/HeadlineStrip";
import { Board } from "@/components/Board";

// Relative age, e.g. "2s ago" / "3m ago". Null when we have no timestamp.
function ago(ms: number, fromMs: number | null): string | null {
  if (fromMs == null) return null;
  const s = Math.max(0, Math.round((ms - fromMs) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function staleAgeStr(ms: number, fromMs: number | null): string {
  if (fromMs == null) return "";
  const s = Math.max(0, Math.round((ms - fromMs) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

export default function Page() {
  const { snapshot, connected } = useStream();
  const now = useNow(1000);
  const [query, setQuery] = useState("");

  const board = snapshot?.board ?? null;
  const stale = snapshot?.stale ?? false;
  const rows = board?.rows ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.coin.toUpperCase().includes(q));
  }, [rows, query]);

  // Headlines come canonically from the backend (R1 ranking + OI floor) — single
  // source of truth. We just render them; no client-side re-ranking.
  const longs = board?.headlines.mostCrowdedLongs ?? [];
  const shorts = board?.headlines.mostCrowdedShorts ?? [];

  // interp's superlative fires only for the rank-1 (top) item (isTop = true).
  const longTop = longs[0]
    ? { ...hlItem(longs[0]), interp: interp(longs[0], true) }
    : null;
  const shortTop = shorts[0]
    ? { ...hlItem(shorts[0]), interp: interp(shorts[0], true) }
    : null;
  const longRest = longs.slice(1, 3).map(hlItem);
  const shortRest = shorts.slice(1, 3).map(hlItem);

  const updatedAgo = ago(now, snapshot?.updatedAt ?? null);
  const staleAge = staleAgeStr(now, snapshot?.updatedAt ?? null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <TopBar
        connected={connected}
        updatedAgo={updatedAgo}
        marketCount={board?.coinCount ?? 0}
        query={query}
        onQuery={setQuery}
      />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 22px 90px" }}>
        {board ? (
          <>
            <HeadlineStrip
              longTop={longTop}
              longRest={longRest}
              shortTop={shortTop}
              shortRest={shortRest}
            />
            <Board
              rows={filtered}
              stale={stale}
              staleAge={staleAge}
              marketCount={board.coinCount}
            />
          </>
        ) : (
          <div
            style={{
              padding: "80px 0",
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: 13,
            }}
          >
            {connected ? "Loading the board…" : "Connecting to the live feed…"}
          </div>
        )}
      </div>
    </div>
  );
}
