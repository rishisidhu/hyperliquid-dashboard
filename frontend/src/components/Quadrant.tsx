"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { BoardRow } from "@/lib/types";

const mono = "var(--font-num)";
const H = 132; // plot height in px (width is responsive via container units)
const MAX_DOTS = 40;

// Axis half-ranges (clamped); dots beyond are pinned to the edge.
const X_MAX = 12; // 24h price change %
const Y_MAX = 8; // OI-trend pctChange %

interface Dot {
  coin: string;
  xPct: number; // 0..100 across the plot width
  yPx: number; // 0..H down the plot
  r: number; // radius ∝ √OI
  regime: string;
}

function regimeOf(x: number, y: number): string {
  if (x >= 0) return y >= 0 ? "New longs" : "Short squeeze";
  return y >= 0 ? "New shorts" : "Long unwind";
}

// OI/price regime scatter. Each market is a dot positioned by (24h price change,
// OI-trend). Four regimes emerge; dots drift as data updates — animated with a
// GPU-composited CSS transform transition (container-query units keep it
// responsive without distorting the round dots). Descriptive only: we name the
// regime, never advise. Reuses existing row data; no new endpoint.
export function Quadrant({ rows, oiFloorUsd }: { rows: BoardRow[]; oiFloorUsd: number }) {
  const dots = useMemo<Dot[]>(() => {
    const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
    return rows
      .filter(
        (r) =>
          (r.oiNotional ?? 0) >= oiFloorUsd &&
          r.oiTrend?.state === "ok" &&
          r.oiTrend.pctChange != null &&
          r.change24hPct != null,
      )
      .sort((a, b) => (b.oiNotional ?? 0) - (a.oiNotional ?? 0))
      .slice(0, MAX_DOTS)
      .map((r) => {
        const x = r.change24hPct as number;
        const y = r.oiTrend!.pctChange as number;
        return {
          coin: r.coin,
          xPct: ((clamp(x, X_MAX) + X_MAX) / (2 * X_MAX)) * 100,
          yPx: (1 - (clamp(y, Y_MAX) + Y_MAX) / (2 * Y_MAX)) * H,
          r: Math.max(2.5, Math.min(6, Math.sqrt((r.oiNotional as number) / 1e6) * 0.7)),
          regime: regimeOf(x, y),
        };
      });
  }, [rows, oiFloorUsd]);

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: "13px 16px 12px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Regime map</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>24h price × OI trend</span>
      </div>

      {dots.length === 0 ? (
        <div
          style={{
            height: H,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-3)",
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Warming up — building history…
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: H,
            containerType: "inline-size",
          }}
        >
          {/* quadrant axes */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              borderLeft: "1px solid var(--border)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              borderTop: "1px solid var(--border)",
            }}
          />

          {/* labels — plain language, descriptive (regime names only, no advice) */}
          <Label text="New longs" sub="price↑ OI↑" pos="tr" />
          <Label text="Short squeeze" sub="price↑ OI↓" pos="br" />
          <Label text="Long unwind" sub="price↓ OI↓" pos="bl" />
          <Label text="New shorts" sub="price↓ OI↑" pos="tl" />

          {/* drifting dots — transform transition ≈ one tick (GPU-composited) */}
          {dots.map((d) => (
            <span
              key={d.coin}
              title={`${d.coin} · ${d.regime}`}
              style={
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: d.r * 2,
                  height: d.r * 2,
                  marginLeft: -d.r,
                  marginTop: -d.r,
                  borderRadius: "50%",
                  background: "var(--text-2)",
                  opacity: 0.5,
                  "--x": d.xPct.toFixed(2),
                  "--y": d.yPx.toFixed(1),
                  transform: "translate(calc(var(--x) * 1cqw), calc(var(--y) * 1px))",
                  transition: "transform 1.8s linear, opacity .3s",
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Label({
  text,
  sub,
  pos,
}: {
  text: string;
  sub: string;
  pos: "tl" | "tr" | "bl" | "br";
}) {
  const v = pos[0] === "t" ? { top: 2 } : { bottom: 2 };
  const h =
    pos[1] === "l"
      ? { left: 4, textAlign: "left" as const }
      : { right: 4, textAlign: "right" as const };
  return (
    <div style={{ position: "absolute", ...v, ...h, pointerEvents: "none" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-2)" }}>{text}</div>
      <div style={{ fontFamily: mono, fontSize: 9, color: "var(--text-4)" }}>{sub}</div>
    </div>
  );
}
