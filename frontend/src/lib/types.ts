// Shape of the SSE payload from the backend /stream endpoint.
// Mirrors backend/src/derive.js (deriveBoard) + cache.snapshot().

export type SkewSide = "long" | "short" | "none";

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
}

export interface Board {
  rows: BoardRow[];
  headlines: {
    mostCrowdedLongs: BoardRow[];
    mostCrowdedShorts: BoardRow[];
  };
  coinCount: number;
}

export interface Snapshot {
  updatedAt: number | null;
  stale: boolean;
  board: Board | null;
}
