"use client";

import { Fragment, useMemo, useState } from "react";
import type { BoardRow, PredictedFundings, Theme } from "@/lib/types";
import type { GlossaryKey } from "@/lib/glossary";
import { rowVM } from "@/lib/viewModel";
import { selectTopN, applyHideBalanced } from "@/lib/density.mjs";

type TopN = 10 | 25 | 50 | "all";
import { Pips } from "./Pips";
import { RowDetail } from "./RowDetail";
import { InfoTip } from "./InfoTip";

const mono = "var(--font-num)";

type SortKey =
  | "coin"
  | "intensity"
  | "funding"
  | "oi"
  | "chg"
  | "vol"
  | "trend";
type Dir = "asc" | "desc";

// Accessor per sort key; null/non-finite always sinks to the bottom.
const accessors: Record<SortKey, (r: BoardRow) => number | string | null> = {
  coin: (r) => r.coin,
  intensity: (r) => (r.skew.side === "none" ? 0 : r.skew.intensity),
  funding: (r) => r.annualizedFundingPct,
  oi: (r) => r.oiNotional,
  chg: (r) => r.change24hPct,
  vol: (r) => r.dayNtlVlm,
  trend: (r) => (r.oiTrend && r.oiTrend.state === "ok" ? r.oiTrend.pctChange : null),
};

interface Column {
  key: SortKey;
  label: string;
  align: "left" | "right";
  defaultDir: Dir;
  term?: GlossaryKey; // attaches a tooltip to the header
}

const COLUMNS: Column[] = [
  { key: "coin", label: "Market", align: "left", defaultDir: "asc" },
  { key: "intensity", label: "Crowd skew", align: "left", defaultDir: "desc", term: "crowdSkew" },
  { key: "funding", label: "Funding ann.", align: "right", defaultDir: "desc", term: "funding" },
  { key: "oi", label: "Open int.", align: "right", defaultDir: "desc", term: "openInterest" },
  { key: "chg", label: "24h", align: "right", defaultDir: "desc", term: "change24h" },
  { key: "vol", label: "24h vol", align: "right", defaultDir: "desc", term: "volume24h" },
  { key: "trend", label: "OI trend", align: "left", defaultDir: "desc", term: "oiTrend" },
];

function compare(
  a: number | string | null,
  b: number | string | null,
  dir: Dir,
): number {
  // nulls last regardless of direction
  const an = a == null || (typeof a === "number" && !Number.isFinite(a));
  const bn = b == null || (typeof b === "number" && !Number.isFinite(b));
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  let cmp: number;
  if (typeof a === "string" || typeof b === "string") {
    cmp = String(a).localeCompare(String(b));
  } else {
    cmp = (a as number) - (b as number);
  }
  return dir === "asc" ? cmp : -cmp;
}

interface BoardProps {
  rows: BoardRow[];
  stale: boolean;
  staleAge: string;
  marketCount: number;
  predicted: PredictedFundings | null;
  // True when a search filter is active — search escapes the Top-N limit.
  searching: boolean;
  // Shared significance floor from the backend payload (hide-balanced).
  oiFloorUsd: number;
  theme: Theme;
}

const TOP_N_OPTIONS: TopN[] = [10, 25, 50, "all"];

export function Board({
  rows,
  stale,
  staleAge,
  marketCount,
  predicted,
  searching,
  oiFloorUsd,
  theme,
}: BoardProps) {
  // Default sort is crowd-intensity DESC by deliberate product choice: the
  // thesis is "where is the crowd", so the board leads with the most stretched
  // markets, not the biggest. A market selected into the curated set because
  // it's extremely crowded therefore appears near the top ("why is this here"
  // is obvious). All columns (incl. OI) remain available as click-to-sort.
  const [sortKey, setSortKey] = useState<SortKey>("intensity");
  const [dir, setDir] = useState<Dir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [topN, setTopN] = useState<TopN>(25);
  const [hideBalanced, setHideBalanced] = useState(false);

  // Pipeline: hide-balanced filter → Top-N density (skipped while searching) →
  // sort by the active column. Search escapes the limit so any market is findable.
  const visible = useMemo(() => {
    const filtered = applyHideBalanced(rows, hideBalanced, oiFloorUsd);
    // Curated Top-N is "real markets only" (≥ floor); search bypasses selectTopN
    // and "All" is exempt inside it, so sub-floor coins stay reachable.
    return searching ? filtered : selectTopN(filtered, topN, oiFloorUsd);
  }, [rows, hideBalanced, oiFloorUsd, searching, topN]);

  const sorted = useMemo(() => {
    const acc = accessors[sortKey];
    return [...visible].sort((x, y) => compare(acc(x), acc(y), dir));
  }, [visible, sortKey, dir]);

  function onSort(col: Column) {
    if (col.key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setDir(col.defaultDir);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".02em" }}>
            Board
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {searching
              ? `${sorted.length} of ${marketCount} markets · search`
              : `showing ${sorted.length} of ${marketCount} markets`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* hide-balanced — opt-in; keeps big balanced markets via the OI floor */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: "var(--text-3)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={hideBalanced}
              onChange={(e) => setHideBalanced(e.target.checked)}
              style={{ accentColor: "var(--long)", cursor: "pointer" }}
            />
            Hide balanced
          </label>

          {/* Top-N selector; "All" always available */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>Show</span>
            {TOP_N_OPTIONS.map((n) => {
              const on = topN === n;
              return (
                <button
                  key={String(n)}
                  type="button"
                  onClick={() => setTopN(n)}
                  disabled={searching}
                  aria-pressed={on}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    fontFamily: mono,
                    border: `1px solid ${on ? "var(--border-strong)" : "var(--border)"}`,
                    borderRadius: 5,
                    background: on ? "var(--surface-3)" : "transparent",
                    color: searching
                      ? "var(--text-4)"
                      : on
                        ? "var(--text-1)"
                        : "var(--text-3)",
                    cursor: searching ? "not-allowed" : "pointer",
                  }}
                >
                  {n === "all" ? "All" : n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 9,
          overflow: "hidden",
          background: "var(--surface-1)",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "var(--board-cols)",
            alignItems: "center",
            gap: 14,
            height: 36,
            padding: "0 16px",
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
            fontSize: 10.5,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {COLUMNS.map((col) => {
            const active = col.key === sortKey;
            return (
              <span
                key={col.key}
                onClick={() => onSort(col)}
                title={`Sort by ${col.label}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  justifyContent: col.align === "right" ? "flex-end" : "flex-start",
                  color: active ? "var(--text-1)" : undefined,
                  userSelect: "none",
                }}
              >
                {col.label}
                {col.term && <InfoTip term={col.term} stopPropagation />}
                <span style={{ color: "var(--text-2)", fontSize: 9 }}>
                  {active ? (dir === "desc" ? "▼" : "▲") : ""}
                </span>
              </span>
            );
          })}
        </div>

        {/* rows */}
        {sorted.map((r) => {
          const vm = rowVM(r, stale, staleAge, theme);
          const isOpen = expanded === r.coin;
          return (
            <Fragment key={r.coin}>
            <div
              className="board-row"
              onClick={() => setExpanded(isOpen ? null : r.coin)}
              role="button"
              aria-expanded={isOpen}
              style={{
                display: "grid",
                gridTemplateColumns: "var(--board-cols)",
                alignItems: "center",
                gap: 14,
                minHeight: 46,
                padding: "7px 16px",
                borderBottom: "1px solid var(--border)",
                opacity: vm.dim,
                cursor: "pointer",
                background: isOpen ? "var(--surface-2)" : undefined,
              }}
            >
              {/* market */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{vm.coin}</span>
                  {vm.lev && (
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 9.5,
                        color: "var(--text-4)",
                        border: "1px solid var(--border)",
                        borderRadius: 3,
                        padding: "0 4px",
                      }}
                    >
                      {vm.lev}
                    </span>
                  )}
                  {vm.stale && (
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 9,
                        letterSpacing: ".08em",
                        color: "var(--stale)",
                        border:
                          "1px solid color-mix(in oklch, var(--stale), transparent 60%)",
                        borderRadius: 3,
                        padding: "0 4px",
                      }}
                    >
                      STALE {vm.staleAge}
                    </span>
                  )}
                  {r.atOiCap && (
                    <span
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontFamily: mono,
                        fontSize: 9,
                        letterSpacing: ".06em",
                        color: "var(--stale)",
                        border:
                          "1px solid color-mix(in oklch, var(--stale), transparent 55%)",
                        borderRadius: 3,
                        padding: "0 4px",
                      }}
                    >
                      🚫 AT CAP
                      <InfoTip term="oiCap" stopPropagation />
                    </span>
                  )}
                </div>
                <span
                  style={{ fontFamily: mono, fontSize: 11, color: "var(--text-3)" }}
                >
                  {vm.price}
                </span>
              </div>

              {/* crowd skew */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Pips pips={vm.pips} balanced={vm.isBalanced} />
                <span
                  style={{ fontSize: 12.5, fontWeight: 500, color: vm.skewTextColor }}
                >
                  {vm.label}
                </span>
              </div>

              {/* funding */}
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "right",
                  color: vm.fundingColor,
                }}
              >
                {vm.funding}
              </span>

              {/* oi */}
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  textAlign: "right",
                  color: "var(--text-2)",
                }}
              >
                {vm.oi}
              </span>

              {/* 24h change (monochrome, caret-coded) */}
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 12.5,
                  textAlign: "right",
                  color: vm.chgColor,
                }}
              >
                {vm.chg}
              </span>

              {/* vol */}
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  textAlign: "right",
                  color: "var(--text-3)",
                }}
              >
                {vm.vol}
              </span>

              {/* oi trend */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {vm.trend.warming ? (
                  <>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--text-3)",
                        animation: "warm 1.6s ease-in-out infinite",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-3)",
                        fontStyle: "italic",
                      }}
                    >
                      Warming up
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      style={{ fontFamily: mono, fontSize: 12, color: vm.trend.color }}
                    >
                      {vm.trend.glyph}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {vm.trend.word}
                    </span>
                    <span
                      style={{ fontFamily: mono, fontSize: 11, color: "var(--text-4)" }}
                    >
                      {vm.trend.pct}
                    </span>
                  </>
                )}
              </div>
            </div>
            {isOpen && (
              <RowDetail coin={r.coin} venues={predicted?.byCoin?.[r.coin]?.venues ?? null} />
            )}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
