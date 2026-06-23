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

test('crowdSkew intensity scales 0..1 and clamps', () => {
  assert.equal(crowdSkew(5).intensity, 0); // at balanced edge
  assert.equal(crowdSkew(1000).intensity, 1); // clamped
  const mid = crowdSkew(-1000).intensity;
  assert.equal(mid, 1);
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

test('deriveHeadlines ranks by funding x OI and splits sides', () => {
  const rows = [
    { coin: 'A', annualizedFundingPct: 10, oiNotional: 1000 }, // long, score 10000
    { coin: 'B', annualizedFundingPct: 50, oiNotional: 10 }, // long, score 500
    { coin: 'C', annualizedFundingPct: -30, oiNotional: 2000 }, // short, score -60000
    { coin: 'D', annualizedFundingPct: -5, oiNotional: 10 }, // short, score -50
    { coin: 'E', annualizedFundingPct: null, oiNotional: 1 }, // excluded
  ];
  const { mostCrowdedLongs, mostCrowdedShorts } = deriveHeadlines(rows, 5);
  assert.deepEqual(mostCrowdedLongs.map((r) => r.coin), ['A', 'B']);
  assert.deepEqual(mostCrowdedShorts.map((r) => r.coin), ['C', 'D']);
});

test('deriveBoard skips delisted and builds headlines', () => {
  const meta = {
    universe: [
      { name: 'BTC', maxLeverage: 40 },
      { name: 'OLD', isDelisted: true },
    ],
  };
  const ctxs = [
    { funding: '0.0001', openInterest: '100', markPx: '50000', prevDayPx: '40000' },
    { funding: '0.0001', openInterest: '1', markPx: '1', prevDayPx: '1' },
  ];
  const board = deriveBoard({ meta, ctxs });
  assert.equal(board.coinCount, 1);
  assert.equal(board.rows[0].coin, 'BTC');
  assert.ok(board.headlines.mostCrowdedLongs.length >= 0);
});
