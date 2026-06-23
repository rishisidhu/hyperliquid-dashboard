// Numeric formatters — ported verbatim from design/design-tokens.md.
// All numerics render in JetBrains Mono (tabular) per the locked design.

export function usd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) {
    const v = n / 1e6;
    return "$" + (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + "M";
  }
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

export function pct(n: number): string {
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

export function price(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1)
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  return n.toPrecision(3);
}
