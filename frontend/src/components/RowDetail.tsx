"use client";

import { useEffect, useState } from "react";
import type { FundingHistoryResponse, PredictedVenue } from "@/lib/types";
import { getFundingHistory } from "@/lib/fundingHistory";
import { Sparkline } from "./Sparkline";

const mono = "var(--font-num)";

function fundingColor(pct: number): string {
  return pct > 0 ? "var(--long)" : pct < 0 ? "var(--short)" : "var(--text-2)";
}

// "in 42m" / "in 3h 10m" until the next funding, or a clock time if far off.
function nextFundingLabel(ts: number | null, now: number): string {
  if (ts == null) return "—";
  const ms = ts - now;
  if (ms <= 0) return "due";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  return `in ${h}h ${mins % 60}m`;
}

interface VenueRowProps {
  v: PredictedVenue;
  now: number;
}
function VenueRow({ v, now }: VenueRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 96px 1fr",
        alignItems: "baseline",
        gap: 12,
        padding: "5px 0",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{v.venue}</span>
      <span
        style={{
          fontFamily: mono,
          fontSize: 13,
          fontWeight: 500,
          textAlign: "right",
          color: fundingColor(v.annualizedPct),
        }}
      >
        {(v.annualizedPct > 0 ? "+" : "") + v.annualizedPct.toFixed(2)}%
      </span>
      <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: mono }}>
        {v.intervalHours}h interval · next {nextFundingLabel(v.nextFundingTime, now)}
      </span>
    </div>
  );
}

interface RowDetailProps {
  coin: string;
  venues: PredictedVenue[] | null;
}

export function RowDetail({ coin, venues }: RowDetailProps) {
  const [history, setHistory] = useState<FundingHistoryResponse | null>(null);
  const [error, setError] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let active = true;
    setHistory(null);
    setError(false);
    getFundingHistory(coin)
      .then((h) => active && setHistory(h))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [coin]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
        gap: 28,
        padding: "14px 16px 18px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Cross-venue funding — descriptive only: numbers + next funding times. */}
      <div>
        <div style={label}>Annualized funding by venue</div>
        {venues && venues.length > 0 ? (
          venues.map((v) => <VenueRow key={v.code} v={v} now={now} />)
        ) : (
          <span style={muted}>Cross-venue data loading…</span>
        )}
      </div>

      {/* Funding history sparkline */}
      <div>
        <div style={label}>Funding history · annualized</div>
        {error ? (
          <span style={muted}>History unavailable right now.</span>
        ) : history ? (
          <Sparkline points={history.points} />
        ) : (
          <span style={muted}>Loading history…</span>
        )}
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 8,
};
const muted: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-3)",
  fontStyle: "italic",
};
