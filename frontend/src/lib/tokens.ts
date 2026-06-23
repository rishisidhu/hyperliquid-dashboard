// Intensity → color ramp + pips — ported verbatim from design/design-tokens.md.
// side: 'long' | 'short' | 'none'; t: intensity 0..1.
// Lightness AND chroma both climb with intensity (OKLCH). Balanced (none) is a
// neutral axis tick, never an empty/broken cell.

import type { SkewSide } from "./types";

export function skewColor(side: SkewSide, t: number): string {
  if (side === "none") return "var(--balanced)";
  if (side === "long")
    return `oklch(${(0.5 + 0.26 * t).toFixed(3)} ${(0.045 + 0.105 * t).toFixed(3)} 195)`;
  // short
  return `oklch(${(0.55 + 0.24 * t).toFixed(3)} ${(0.055 + 0.105 * t).toFixed(3)} 70)`;
}

export function pipCount(t: number): number {
  return t <= 0 ? 0 : Math.max(1, Math.ceil(t * 5)); // 0..5
}

export interface Pip {
  color: string;
}

export function pips(side: SkewSide, t: number): Pip[] {
  const n = pipCount(t);
  const col = skewColor(side, t);
  return Array.from({ length: 5 }, (_, i) => ({
    color: i < n ? col : "var(--pip-off)",
  }));
}
