// Intensity → color ramp + pips. side: 'long' | 'short' | 'none'; t: 0..1.
// Balanced (none) is a neutral axis tick, never an empty/broken cell.
//
// The ramp is theme-aware (the only colour logic that can't live in CSS, since
// it's continuous in intensity):
//   - DARK: lightness AND chroma climb with intensity (brighter = more extreme
//     on a dark surface) — the original design ramp.
//   - LIGHT: lightness FALLS while chroma climbs (darker, more saturated = more
//     extreme on a light surface), so pips stay legible on white. Hues are
//     unchanged (195 teal / 70 amber) — colourblind-safe in both themes.

import type { SkewSide, Theme } from "./types";

export function skewColor(side: SkewSide, t: number, theme: Theme = "dark"): string {
  if (side === "none") return "var(--balanced)";
  if (theme === "light") {
    if (side === "long")
      return `oklch(${(0.66 - 0.2 * t).toFixed(3)} ${(0.06 + 0.1 * t).toFixed(3)} 195)`;
    // short
    return `oklch(${(0.7 - 0.2 * t).toFixed(3)} ${(0.07 + 0.1 * t).toFixed(3)} 70)`;
  }
  // dark (default)
  if (side === "long")
    return `oklch(${(0.5 + 0.26 * t).toFixed(3)} ${(0.045 + 0.105 * t).toFixed(3)} 195)`;
  return `oklch(${(0.55 + 0.24 * t).toFixed(3)} ${(0.055 + 0.105 * t).toFixed(3)} 70)`;
}

export function pipCount(t: number): number {
  return t <= 0 ? 0 : Math.max(1, Math.ceil(t * 5)); // 0..5
}

export interface Pip {
  color: string;
}

export function pips(side: SkewSide, t: number, theme: Theme = "dark"): Pip[] {
  const n = pipCount(t);
  const col = skewColor(side, t, theme);
  return Array.from({ length: 5 }, (_, i) => ({
    color: i < n ? col : "var(--pip-off)",
  }));
}
