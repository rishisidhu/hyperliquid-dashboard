// Unit tests for the pure derivation logic (no I/O).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdSkew, deriveRow, deriveHeadlines, deriveBoard } from '../src/derive.js';

test('crowdSkew classifies sides and balance', () => {
  assert.equal(crowdSkew(0).label, 'Balanced');
  assert.equal(crowdSkew(2).label, 'Balanced'); // below balanced threshold
  assert.equal(crowdSkew(20).label, 'Longs crowded');
  assert.equal(crowdSkew(20).side, 'long');
  assert.equal(crowdSkew(-20).label, 'Shorts crowded');
  assert.equal(crowdSkew(-20).side, 'short');
  assert.equal(crowdSkew(null).label, 'Unknown');
});

test('crowdSkew intensity is a clamped log scale', () => {
  assert.equal(crowdSkew(5).intensity, 0); // at the balanced edge (log10(5)-log10(5))
  assert.equal(crowdSkew(700).intensity, 1); // at the extreme anchor
  assert.equal(crowdSkew(1000).intensity, 1); // clamped beyond HI
  assert.equal(crowdSkew(-1000).intensity, 1);
});

test('crowdSkew log scale stays monotonic + distinct across the extreme tail', () => {
  // The whole point of the fix: 50/100/300/700% must NOT all saturate to 1.0.
  const t = (v) => crowdSkew(v).intensity;
  const vals = [10, 30, 50, 100, 300, 700].map(t);
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i] > vals[i - 1], `intensity must increase: ${vals[i - 1]} -> ${vals[i]}`);
  }
  assert.ok(Math.abs(t(50) - 0.466) < 0.01); // sanity vs the proposal table
  // distinct pip buckets across the range (ceil(t*5)): 1,2,3,4,5
  const pip = (v) => Math.max(1, Math.ceil(t(v) * 5));
  assert.deepEqual([10, 30, 50, 100, 300].map(pip), [1, 2, 3, 4, 5]);
});

test('deriveRow annualizes funding and computes notional/change', () => {
  const uni = { name: 'BTC', maxLeverage: 40 };
  const ctx = {
    funding: '0.0001', // hourly
    openInterest: '100',
    markPx: '50000',
    prevDayPx: '40000',
    dayNtlVlm: '123',
    premium: '0.0005',
    oraclePx: '49990',
    midPx: '50001',
  };
  const row = deriveRow(uni, ctx);
  assert.equal(row.coin, 'BTC');
  // 0.0001 * 24 * 365 * 100 = 87.6
  assert.ok(Math.abs(row.annualizedFundingPct - 87.6) < 1e-9);
  assert.equal(row.oiNotional, 100 * 50000);
  assert.equal(row.change24hPct, 25); // (50000-40000)/40000*100
  assert.equal(row.skew.label, 'Longs crowded');
  assert.equal(row.oiTrend, null); // Phase 2
});

test('deriveRow tolerates missing/garbage fields', () => {
  const row = deriveRow({ name: 'X' }, { markPx: 'NaN', funding: '', openInterest: null });
  assert.equal(row.coin, 'X');
  assert.equal(row.annualizedFundingPct, null);
  assert.equal(row.oiNotional, null);
  assert.equal(row.skew.label, 'Unknown');
});

test('deriveRow returns null without a ctx', () => {
  assert.equal(deriveRow({ name: 'X' }, undefined), null);
});

test('deriveHeadlines (R1) ranks by |ann %| desc above the OI floor', () => {
  const rows = [
    { coin: 'BIG', annualizedFundingPct: 30, oiNotional: 5e6, skew: { side: 'long' } },
    { coin: 'HUGE', annualizedFundingPct: 80, oiNotional: 2e6, skew: { side: 'long' } },
    { coin: 'TINY', annualizedFundingPct: 500, oiNotional: 100, skew: { side: 'long' } }, // below floor
    { coin: 'SH1', annualizedFundingPct: -106, oiNotional: 3e6, skew: { side: 'short' } },
    { coin: 'SH2', annualizedFundingPct: -53, oiNotional: 9e6, skew: { side: 'short' } },
    { coin: 'BAL', annualizedFundingPct: 1, oiNotional: 9e6, skew: { side: 'none' } }, // balanced
  ];
  const { mostCrowdedLongs, mostCrowdedShorts } = deriveHeadlines(rows, { oiFloorUsd: 1e6 });
  // TINY's extreme funding doesn't lead — it's below the floor (illiquid).
  assert.deepEqual(mostCrowdedLongs.map((r) => r.coin), ['HUGE', 'BIG']);
  // The fix: more-extreme short leads, regardless of OI ordering (SH1 -106 > SH2 -53).
  assert.deepEqual(mostCrowdedShorts.map((r) => r.coin), ['SH1', 'SH2']);
});

test('deriveHeadlines tiebreak: OI desc, then coin asc', () => {
  const rows = [
    { coin: 'BBB', annualizedFundingPct: 40, oiNotional: 2e6, skew: { side: 'long' } },
    { coin: 'AAA', annualizedFundingPct: 40, oiNotional: 2e6, skew: { side: 'long' } },
    { coin: 'CCC', annualizedFundingPct: 40, oiNotional: 5e6, skew: { side: 'long' } },
  ];
  const { mostCrowdedLongs } = deriveHeadlines(rows, { oiFloorUsd: 1e6 });
  assert.deepEqual(mostCrowdedLongs.map((r) => r.coin), ['CCC', 'AAA', 'BBB']);
});

test('deriveBoard skips delisted and builds canonical headlines', () => {
  const meta = {
    universe: [
      { name: 'BTC', maxLeverage: 40 },
      { name: 'OLD', isDelisted: true },
    ],
  };
  const ctxs = [
    { funding: '0.0001', openInterest: '100', markPx: '50000', prevDayPx: '40000' }, // OI $5M
    { funding: '0.0001', openInterest: '1', markPx: '1', prevDayPx: '1' },
  ];
  const board = deriveBoard({ meta, ctxs }); // default floor $1M
  assert.equal(board.coinCount, 1);
  assert.equal(board.rows[0].coin, 'BTC');
  assert.equal(board.headlines.mostCrowdedLongs[0].coin, 'BTC');
});
