// Shape of the SSE payload from the backend /stream endpoint.
// Mirrors backend/src/derive.js (deriveBoard) + cache.snapshot().

export type SkewSide = "long" | "short" | "none";

export type Theme = "dark" | "light";

export interface Skew {
  label: string; // "Longs crowded" | "Shorts crowded" | "Balanced" | "Unknown"
  side: SkewSide;
  intensity: number; // 0..1
}

export type TrendState = "ok" | "warming";
export type TrendDirection = "rising" | "unwinding" | "flat" | null;

export interface OiTrend {
  state: TrendState;
  direction: TrendDirection;
  pctChange: number | null;
  refAgeMs?: number | null;
}

export interface BoardRow {
  coin: string;
  maxLeverage: number | null;
  markPx: number | null;
  change24hPct: number | null;
  funding: number | null;
  annualizedFundingPct: number | null;
  skew: Skew;
  openInterest: number | null;
  oiNotional: number | null;
  dayNtlVlm: number | null;
  premium: number | null;
  oraclePx: number | null;
  midPx: number | null;
  oiTrend: OiTrend | null;
  // At its open-interest cap — no new positions can be opened (Phase 7).
  atOiCap?: boolean;
}

export interface Board {
  rows: BoardRow[];
  headlines: {
    mostCrowdedLongs: BoardRow[];
    mostCrowdedShorts: BoardRow[];
  };
  coinCount: number;
  // Shared significance floor ($) — frontend reads it for hide-balanced.
  oiFloorUsd: number;
}

export interface Snapshot {
  updatedAt: number | null;
  stale: boolean;
  board: Board | null;
}

// ── Cross-venue predicted fundings (Phase 5, separate `predicted` SSE event) ──
export interface PredictedVenue {
  venue: string; // display name, e.g. "Hyperliquid"
  code: string; // raw venue code, e.g. "HlPerp"
  annualizedPct: number; // comparable across venues (annualized per interval)
  intervalHours: number;
  nextFundingTime: number | null;
}

export interface PredictedFundings {
  updatedAt: number | null;
  byCoin: Record<string, { venues: PredictedVenue[] }> | null;
}

// ── Funding-history sparkline (Phase 5, on-demand /funding-history) ──
export interface FundingHistoryPoint {
  time: number;
  annualizedPct: number;
}

export interface FundingHistoryResponse {
  coin: string;
  points: FundingHistoryPoint[];
  cachedAt: number;
}
