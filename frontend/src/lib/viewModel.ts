// View-model layer — ported near-verbatim from the mockup's DCLogic
// (rowVM / trendVM / interp / hlItem). Two faithful adaptations:
//   1. Staleness is board-level here (the backend marks the whole snapshot
//      stale on a poll failure), so `stale`/`staleAge` are passed in per render
//      rather than living on each row.
//   2. Null-safe: the live feed can carry null numerics (e.g. before a field is
//      known); the mockup's fixtures never did. Missing numbers render as "—".

import type { BoardRow, OiTrend, SkewSide } from "./types";
import { pips, type Pip } from "./tokens";
import { usd, pct, price } from "./format";

const DASH = "—";

function fmt(n: number | null, f: (x: number) => string): string {
  return n == null || !Number.isFinite(n) ? DASH : f(n);
}

export interface TrendVM {
  warming: boolean;
  normal: boolean;
  glyph?: string;
  word?: string;
  color?: string;
  pct?: string;
}

export function trendVM(t: OiTrend | null): TrendVM {
  if (!t || t.state === "warming") return { warming: true, normal: false };
  const m =
    {
      rising: { glyph: "▲", word: "Rising", color: "var(--rising)" },
      unwinding: { glyph: "▼", word: "Unwinding", color: "var(--unwinding)" },
      flat: { glyph: "—", word: "Flat", color: "var(--flat)" },
    }[t.direction ?? "flat"] ?? {
      glyph: "—",
      word: "Flat",
      color: "var(--flat)",
    };
  const change = t.pctChange ?? 0;
  return {
    warming: false,
    normal: true,
    glyph: m.glyph,
    word: m.word,
    color: m.color,
    pct: (change > 0 ? "+" : "") + change.toFixed(1) + "%",
  };
}

export interface RowVM {
  coin: string;
  lev: string;
  price: string;
  isBalanced: boolean;
  notBalanced: boolean;
  label: string;
  skewTextColor: string;
  pips: Pip[];
  funding: string;
  fundingColor: string;
  oi: string;
  vol: string;
  chg: string;
  chgColor: string;
  trend: TrendVM;
  stale: boolean;
  staleAge: string;
  dim: number;
}

export function rowVM(r: BoardRow, stale: boolean, staleAge: string): RowVM {
  const s = r.skew;
  const bal = s.side === "none";
  const skewTextCol = bal
    ? "var(--balanced)"
    : s.side === "long"
      ? "var(--long)"
      : "var(--short)";
  const fundingNum = r.annualizedFundingPct;
  const chgNum = r.change24hPct;
  return {
    coin: r.coin,
    lev: r.maxLeverage != null ? r.maxLeverage + "×" : "",
    price: fmt(r.markPx, price),
    isBalanced: bal,
    notBalanced: !bal,
    label: s.label,
    skewTextColor: skewTextCol,
    pips: pips(s.side, s.intensity),
    funding: fmt(fundingNum, pct),
    fundingColor:
      fundingNum != null && fundingNum > 0
        ? "var(--long)"
        : fundingNum != null && fundingNum < 0
          ? "var(--short)"
          : "var(--text-2)",
    oi: fmt(r.oiNotional, usd),
    vol: fmt(r.dayNtlVlm, usd),
    chg:
      chgNum == null
        ? DASH
        : (chgNum > 0 ? "▲ " : "▽ ") + pct(chgNum),
    chgColor:
      chgNum != null && chgNum > 0 ? "var(--text-1)" : "var(--text-3)",
    trend: trendVM(r.oiTrend),
    stale,
    staleAge,
    dim: stale ? 0.5 : 1,
  };
}

// ── Headline strip ──────────────────────────────────────────────────────────
// Locked design: rank by skew.intensity desc, exclude balanced/stale rows.
// (Backend also emits funding×OI headlines; reconciling the two is the SPEC §12
//  open question — deferred. The design wins for now.)
export function headline(rows: BoardRow[], side: SkewSide): BoardRow[] {
  return rows
    .filter((r) => r.skew.side === side)
    .sort((a, b) => b.skew.intensity - a.skew.intensity);
}

export interface HeadlineItem {
  coin: string;
  lev: string;
  label: string;
  funding: string;
  pips: Pip[];
  intensity: number;
}

export function hlItem(r: BoardRow): HeadlineItem {
  return {
    coin: r.coin,
    lev: r.maxLeverage != null ? r.maxLeverage + "×" : "",
    label: r.skew.label,
    funding: fmt(r.annualizedFundingPct, pct),
    pips: pips(r.skew.side, r.skew.intensity),
    intensity: r.skew.intensity,
  };
}

// Descriptive, never prescriptive (no buy/sell). Ported from interp().
export function interp(r: BoardRow): string {
  const t = r.skew.intensity;
  const f = Math.abs(r.annualizedFundingPct ?? 0).toFixed(1);
  const qual =
    t >= 0.6
      ? "the most one-sided book on the board"
      : t >= 0.3
        ? "a heavily crowded book"
        : "a mild lean";
  if (r.skew.side === "long")
    return `Longs are paying ${f}% a year to hold ${r.coin} — ${qual}.`;
  return `Shorts are paying ${f}% a year to stay short ${r.coin} — ${qual}.`;
}
