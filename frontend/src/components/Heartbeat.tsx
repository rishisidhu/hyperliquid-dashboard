"use client";

import type { HeartbeatSeries } from "@/lib/useHeartbeat";
import { InfoTip } from "./InfoTip";

const mono = "var(--font-num)";
const W = 520;
const H = 132;
const PAD_T = 14;
const PAD_B = 14;
const WINDOW = 60;

function sideColor(side: HeartbeatSeries["side"]): string {
  return side === "long" ? "var(--long)" : side === "short" ? "var(--short)" : "var(--flat)";
}

// Live "heartbeat": signed annualized funding % over a rolling window for the
// top-5 markets by open interest. On-thesis (positioning, not price). Redrawn
// once per snapshot (~30×/min); the continuous pulse comes from a GPU-composited
// CSS-animated leading dot, not per-frame JS.
export function Heartbeat({ series }: { series: HeartbeatSeries[] }) {
  const maxLen = series.reduce((m, s) => Math.max(m, s.funding.length), 0);

  // Symmetric y-domain around 0, with a floor so small values aren't amplified.
  const peak = Math.max(
    25,
    ...series.flatMap((s) => s.funding.map((v) => Math.abs(v))),
  );
  const x = (i: number) => (i / (WINDOW - 1)) * W;
  const y = (v: number) => PAD_T + (1 - (v + peak) / (2 * peak)) * (H - PAD_T - PAD_B);
  const zeroY = y(0);

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
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--rising)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Crowd pulse</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          top 5 by open interest · annualized funding
        </span>
        <InfoTip term="funding" />
      </div>

      {maxLen < 2 ? (
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
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* zero baseline */}
          <line
            x1={0}
            y1={zeroY}
            x2={W}
            y2={zeroY}
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {series.map((s) => {
            const n = s.funding.length;
            // Right-align: newest sample at the right edge, history scrolls left.
            const pts = s.funding
              .map((v, i) => `${x(WINDOW - n + i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(" ");
            const lastV = s.funding[n - 1];
            const lx = x(WINDOW - 1);
            const ly = y(lastV);
            const col = sideColor(s.side);
            return (
              <g key={s.coin}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke={col}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.9}
                />
                {/* pulsing leading dot — continuous life between redraws */}
                <circle
                  cx={lx}
                  cy={ly}
                  r={2.6}
                  fill={col}
                  style={{ animation: "pulse 2s ease-in-out infinite" }}
                />
                <text
                  x={lx - 6}
                  y={ly - 5}
                  textAnchor="end"
                  style={{ fontFamily: mono, fontSize: 9.5, fill: col }}
                >
                  {s.coin}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
