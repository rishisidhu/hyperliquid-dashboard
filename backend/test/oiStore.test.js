import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OiStore } from '../src/oiStore.js';

const HOUR = 3600000;

test('records samples and reads the latest at/before a target time', () => {
  const s = new OiStore(':memory:');
  s.record([{ coin: 'BTC', oiNotional: 100 }], 1000, HOUR);
  s.record([{ coin: 'BTC', oiNotional: 120 }], 2000, HOUR);
  s.record([{ coin: 'BTC', oiNotional: 150 }], 3000, HOUR);

  // Target 2500 -> latest at/before is the ts=2000 / 120 sample.
  const ref = s.referenceMap(2500);
  assert.deepEqual(ref.get('BTC'), { oiNotional: 120, ts: 2000 });
  s.close();
});

test('reference is per-coin (bare-column idiom returns matching row)', () => {
  const s = new OiStore(':memory:');
  s.record([{ coin: 'BTC', oiNotional: 100 }, { coin: 'ETH', oiNotional: 50 }], 1000, HOUR);
  s.record([{ coin: 'BTC', oiNotional: 200 }, { coin: 'ETH', oiNotional: 60 }], 2000, HOUR);
  const ref = s.referenceMap(5000);
  assert.deepEqual(ref.get('BTC'), { oiNotional: 200, ts: 2000 });
  assert.deepEqual(ref.get('ETH'), { oiNotional: 60, ts: 2000 });
  s.close();
});

test('coins with no sample old enough are absent (warming)', () => {
  const s = new OiStore(':memory:');
  s.record([{ coin: 'BTC', oiNotional: 100 }], 5000, HOUR);
  const ref = s.referenceMap(1000); // target before any sample
  assert.equal(ref.has('BTC'), false);
  s.close();
});

test('prune drops samples older than retention before the snapshot ts', () => {
  const s = new OiStore(':memory:');
  s.record([{ coin: 'BTC', oiNotional: 1 }], 1000, HOUR);
  assert.equal(s.count(), 1);
  // New snapshot far in the future -> the old 1000 sample is now > 1h old.
  s.record([{ coin: 'BTC', oiNotional: 2 }], 1000 + HOUR + 1, HOUR);
  assert.equal(s.count(), 1); // only the fresh one survives
  const ref = s.referenceMap(1000 + HOUR + 1);
  assert.equal(ref.get('BTC').oiNotional, 2);
  s.close();
});

test('skips null / non-finite OI notionals', () => {
  const s = new OiStore(':memory:');
  s.record(
    [
      { coin: 'A', oiNotional: null },
      { coin: 'B', oiNotional: NaN },
      { coin: 'C', oiNotional: 42 },
    ],
    1000,
    HOUR,
  );
  assert.equal(s.count(), 1);
  s.close();
});
