import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTopN, applyHideBalanced } from "../src/lib/density.mjs";

// Minimal row factory — only the fields density.mjs reads.
function row(coin, oiNotional, side, intensity = 0.5) {
  return { coin, oiNotional, skew: { side, intensity } };
}

test("selectTopN guarantees the biggest markets even when balanced", () => {
  // One huge balanced market + many small crowded ones.
  const rows = [
    row("ETH", 1_000_000_000, "none", 0), // huge, balanced
    ...Array.from({ length: 30 }, (_, i) =>
      row(`S${i}`, 1_000_000 + i, "short", 0.9),
    ),
  ];
  const top = selectTopN(rows, 10);
  assert.equal(top.length, 10);
  // ETH is balanced (intensity 0) but must survive on size alone.
  assert.ok(top.some((r) => r.coin === "ETH"), "big balanced market must be kept");
});

test("selectTopN fills remaining slots by intensity", () => {
  const rows = [
    row("BIG", 500e6, "long", 0.1),
    row("MID", 50e6, "short", 0.95),
    row("HOT", 5e6, "short", 0.99),
    row("COLD", 2e6, "long", 0.2),
  ];
  const top = selectTopN(rows, 2); // guarantee ceil(2*0.4)=1 by OI, fill 1 by intensity
  assert.ok(top.some((r) => r.coin === "BIG")); // biggest guaranteed
  assert.ok(top.some((r) => r.coin === "HOT")); // most crowded fills
  assert.equal(top.length, 2);
});

test('selectTopN "all" returns everything', () => {
  const rows = [row("A", 1, "long"), row("B", 2, "short")];
  assert.equal(selectTopN(rows, "all").length, 2);
});

test("selectTopN never duplicates a market that's both big and crowded", () => {
  const rows = [
    row("WHALE", 999e6, "short", 0.99), // both biggest AND most crowded
    ...Array.from({ length: 20 }, (_, i) => row(`X${i}`, 1e6 + i, "long", 0.3)),
  ];
  const top = selectTopN(rows, 10);
  const whales = top.filter((r) => r.coin === "WHALE");
  assert.equal(whales.length, 1);
  assert.equal(new Set(top.map((r) => r.coin)).size, top.length);
});

test("applyHideBalanced keeps big balanced markets, drops the small balanced tail", () => {
  const rows = [
    row("ETH", 1_000_000_000, "none", 0), // big balanced — keep
    row("DUST", 100_000, "none", 0), // small balanced — drop
    row("SOL", 50e6, "short", 0.6), // not balanced — keep
  ];
  const kept = applyHideBalanced(rows, true, 1_000_000);
  assert.deepEqual(kept.map((r) => r.coin).sort(), ["ETH", "SOL"]);
  // OFF returns everything untouched.
  assert.equal(applyHideBalanced(rows, false, 1_000_000).length, 3);
});
