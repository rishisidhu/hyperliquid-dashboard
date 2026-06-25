import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualizeVenue, derivePredictedFundings } from '../src/derivePredicted.js';

test('annualizeVenue scales by each venue interval (the correctness detail)', () => {
  // 8h Binance rate and 1h HL rate that should annualize to the same %.
  const bin = annualizeVenue('BinPerp', {
    fundingRate: '0.0008', // per 8h
    fundingIntervalHours: 8,
    nextFundingTime: 111,
  });
  const hl = annualizeVenue('HlPerp', {
    fundingRate: '0.0001', // per 1h  (8x smaller for the same annualized)
    fundingIntervalHours: 1,
    nextFundingTime: 222,
  });
  // 0.0008 * (24/8) * 365 * 100 = 87.6 ; 0.0001 * 24 * 365 * 100 = 87.6
  assert.ok(Math.abs(bin.annualizedPct - 87.6) < 1e-9);
  assert.ok(Math.abs(hl.annualizedPct - 87.6) < 1e-9);
  assert.equal(bin.venue, 'Binance');
  assert.equal(hl.venue, 'Hyperliquid');
  assert.equal(bin.nextFundingTime, 111);
});

test('annualizeVenue returns null for missing/garbage venue data', () => {
  assert.equal(annualizeVenue('BinPerp', null), null); // venue not listed
  assert.equal(annualizeVenue('X', { fundingRate: 'NaN', fundingIntervalHours: 8 }), null);
  assert.equal(annualizeVenue('X', { fundingRate: '0.001', fundingIntervalHours: 0 }), null);
});

test('derivePredictedFundings maps by coin, drops empties, HL first', () => {
  const raw = [
    [
      'BTC',
      [
        ['BinPerp', { fundingRate: '0.00006408', fundingIntervalHours: 8, nextFundingTime: 1 }],
        ['HlPerp', { fundingRate: '0.0000078607', fundingIntervalHours: 1, nextFundingTime: 2 }],
        ['BybitPerp', null], // not listed -> dropped
      ],
    ],
    ['NOVENUES', [['BinPerp', null], ['HlPerp', null]]], // all null -> coin dropped
  ];
  const { byCoin } = derivePredictedFundings(raw);
  assert.ok(byCoin.BTC);
  assert.equal(byCoin.NOVENUES, undefined);
  const v = byCoin.BTC.venues;
  assert.equal(v.length, 2); // bybit dropped
  assert.equal(v[0].venue, 'Hyperliquid'); // HL sorted first
  assert.ok(Math.abs(v[0].annualizedPct - 0.0000078607 * 24 * 365 * 100) < 1e-9);
});

test('derivePredictedFundings tolerates malformed entries', () => {
  const { byCoin } = derivePredictedFundings([null, ['X'], 42, ['Y', 'notarray']]);
  assert.deepEqual(byCoin, {});
});
