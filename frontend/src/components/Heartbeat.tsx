"use client";

import type { HeartbeatSeries } from "@/lib/useHeartbeat";
import { InfoTip } from "./InfoTip";

const mono = "var(--font-num)";
const W = 520;
const H = 132;
const PAD_T = 12;
const PAD_B = 12;
const PLOT_W = 446; // leave room on the right for de-collided value labels
const LABEL_GAP = 13; // min vertical px between stacked labels
const WINDOW = 60;

function sideColor(side: HeartbeatSeries["side"]): string {
  return side === "long" ? "var(--long)" : side === "short" ? "var(--short)" : "var(--flat)";
}

function fmtPct(v: number): string {
  return (v > 0 ? "+" : "") + v.toFixed(3) + "%";
}

// Live "heartbeat": premium (mark vs oracle, %) over a rolling window for the
// top-5 markets by open interest — the real-time crowd-pressure signal that
// funding lags. Redrawn once per snapshot (~30×/min); the continuous pulse comes
// from a GPU-composited CSS-animated leading dot, not per-frame JS.
export function Heartbeat({ series }: { series: HeartbeatSeries[] }) {
  const maxLen = series.reduce((m, s) => Math.max(m, s.values.length), 0);

  // AUTO-SCALE: premium is tiny (fractions of a %), so fit the y-axis to the
  // window's actual min/max + padding — otherwise it looks as flat as funding.
  const all = series.flatMap((s) => s.values);
  let lo = all.length ? Math.min(...all) : -0.01;
  let hi = all.length ? Math.max(...all) : 0.01;
  if (hi - lo < 0.002) {
    // near-flat window: open a tiny symmetric band so the line still reads
    const mid = (hi + lo) / 2;
    lo = mid - 0.001;
    hi = mid + 0.001;
  }
  const pad = (hi - lo) * 0.12;
  const dLo = lo - pad;
  const dHi = hi + pad;

  const x = (i: number) => (i / (WINDOW - 1)) * PLOT_W;
  const y = (v: number) => PAD_T + (1 - (v - dLo) / (dHi - dLo)) * (H - PAD_T - PAD_B);

  // Leading-edge labels, de-collided: greedy top-down min-gap, then push the
  // stack up if it overflows the bottom. Keeps COIN+value readable when lines
  // sit at similar y (the HYPE/BTC, SOL/ETH overlap bug).
  const labels = series
    .filter((s) => s.values.length > 0)
    .map((s) => {
      const v = s.values[s.values.length - 1];
      return { coin: s.coin, side: s.side, value: v, lineY: y(v), labelY: y(v) };
    })
    .sort((a, b) => a.lineY - b.lineY);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].labelY < labels[i - 1].labelY + LABEL_GAP) {
      labels[i].labelY = labels[i - 1].labelY + LABEL_GAP;
    }
  }
  const overflow = labels.length ? labels[labels.length - 1].labelY - (H - 4) : 0;
  if (overflow > 0) for (const l of labels) l.labelY = Math.max(8, l.labelY - overflow);

  const zeroShown = dLo < 0 && dHi > 0;

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
          top 5 by open interest · live premium (mark vs oracle)
        </span>
        <InfoTip term="premium" />
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
        // Relative wrapper: lines live in a stretched SVG (x = time, fine to
        // stretch); dots + labels are an HTML overlay so they stay round/crisp
        // and undistorted. y maps 1:1 to px because the SVG height = viewBox H.
        <div style={{ position: "relative", width: "100%", height: H }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, overflow: "visible" }}
          >
            {zeroShown && (
              <line
                x1={0}
                y1={y(0)}
                x2={PLOT_W}
                y2={y(0)}
                stroke="var(--border-strong)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}
            {series.map((s) => {
              const n = s.values.length;
              if (n < 2) return null;
              // Right-align: newest sample at the plot's right edge, scrolls left.
              const pts = s.values
                .map((v, i) => `${x(WINDOW - n + i).toFixed(1)},${y(v).toFixed(1)}`)
                .join(" ");
              return (
                <polyline
                  key={s.coin}
                  points={pts}
                  fill="none"
                  stroke={sideColor(s.side)}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.9}
                />
              );
            })}
          </svg>

          {/* leading dots (round, pulsing) at the plot's right edge */}
          {series.map((s) => {
            const n = s.values.length;
            if (n < 2) return null;
            return (
              <span
                key={s.coin}
                style={{
                  position: "absolute",
                  left: `${(PLOT_W / W) * 100}%`,
                  top: y(s.values[n - 1]),
                  width: 5,
                  height: 5,
                  marginLeft: -2.5,
                  marginTop: -2.5,
                  borderRadius: "50%",
                  background: sideColor(s.side),
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
            );
          })}

          {/* de-collided labels with current value (round dot + COIN + value) */}
          {labels.map((l) => (
            <span
              key={l.coin}
              style={{
                position: "absolute",
                left: `${((PLOT_W + 6) / W) * 100}%`,
                top: l.labelY,
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: mono,
                fontSize: 9.5,
                color: sideColor(l.side),
                whiteSpace: "nowrap",
              }}
            >
              {l.coin} {fmtPct(l.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
