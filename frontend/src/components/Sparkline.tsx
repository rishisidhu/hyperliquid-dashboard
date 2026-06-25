import type { FundingHistoryPoint } from "@/lib/types";

const mono = "var(--font-num)";

interface SparklineProps {
  points: FundingHistoryPoint[];
  width?: number;
  height?: number;
}

// Inline SVG sparkline of annualized funding over time (no chart lib). A zero
// baseline makes "more vs less stretched over time" legible at a glance; the
// line is hued by the latest sign (teal long / amber short), never red/green.
export function Sparkline({ points, width = 220, height = 44 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <span style={{ fontSize: 11.5, color: "var(--text-3)", fontStyle: "italic" }}>
        Not enough history yet
      </span>
    );
  }

  const vals = points.map((p) => p.annualizedPct);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const pad = 3;
  const innerH = height - pad * 2;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * innerH;

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.annualizedPct).toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1];
  const color = last > 0 ? "var(--long)" : last < 0 ? "var(--short)" : "var(--flat)";
  const zeroY = y(0);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        {/* zero baseline */}
        <line
          x1={0}
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="var(--border-strong)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last)} r={2.5} fill={color} />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color }}>
          {(last > 0 ? "+" : "") + last.toFixed(1)}%
        </span>
        <span style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: ".03em" }}>
          range {lo.toFixed(0)}% … {hi.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
