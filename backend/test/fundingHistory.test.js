import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFundingHistory, FundingHistoryService } from '../src/fundingHistory.js';

test('deriveFundingHistory annualizes and drops garbage', () => {
  const raw = [
    { coin: 'BTC', fundingRate: '0.0001', time: 1000 }, // -> 87.6%
    { coin: 'BTC', fundingRate: 'NaN', time: 2000 }, // dropped
    { coin: 'BTC', fundingRate: '0.0002', time: 'x' }, // dropped (bad time)
  ];
  const pts = deriveFundingHistory(raw);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].time, 1000);
  assert.ok(Math.abs(pts[0].annualizedPct - 87.6) < 1e-9);
});

test('service caches within TTL (one upstream fetch)', async () => {
  let calls = 0;
  let t = 1_000_000;
  const svc = new FundingHistoryService(
    () => t,
    async () => {
      calls++;
      return [{ coin: 'BTC', fundingRate: '0.0001', time: t }];
    },
  );
  const a = await svc.get('BTC');
  const b = await svc.get('BTC'); // within TTL -> served from cache
  assert.equal(calls, 1);
  assert.equal(a.cachedAt, b.cachedAt);
  assert.equal(a.points.length, 1);
});

test('service refetches after TTL expiry', async () => {
  let calls = 0;
  let t = 1_000_000;
  const svc = new FundingHistoryService(
    () => t,
    async () => {
      calls++;
      return [{ coin: 'BTC', fundingRate: '0.0001', time: t }];
    },
  );
  await svc.get('BTC');
  t += 10 * 60 * 1000; // > default 5min TTL
  await svc.get('BTC');
  assert.equal(calls, 2);
});

test('service dedupes concurrent first-requests into one fetch', async () => {
  let calls = 0;
  const t = 1_000_000;
  const svc = new FundingHistoryService(
    () => t,
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return [{ coin: 'ETH', fundingRate: '0.0001', time: t }];
    },
  );
  const [a, b] = await Promise.all([svc.get('ETH'), svc.get('ETH')]);
  assert.equal(calls, 1); // coalesced
  assert.equal(a.points.length, 1);
  assert.equal(b.points.length, 1);
});
