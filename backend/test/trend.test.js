import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOiTrend } from '../src/trend.js';

const NOW = 1_000_000;

test('warming when no reference yet', () => {
  const t = computeOiTrend(100, undefined, NOW, 1.0);
  assert.equal(t.state, 'warming');
  assert.equal(t.direction, null);
  assert.equal(t.pctChange, null);
});

test('warming when current OI is missing', () => {
  const t = computeOiTrend(null, { oiNotional: 100, ts: 0 }, NOW, 1.0);
  assert.equal(t.state, 'warming');
});

test('rising above deadband', () => {
  const t = computeOiTrend(110, { oiNotional: 100, ts: NOW - 1200000 }, NOW, 1.0);
  assert.equal(t.state, 'ok');
  assert.equal(t.direction, 'rising');
  assert.ok(Math.abs(t.pctChange - 10) < 1e-9);
  assert.equal(t.refAgeMs, 1200000);
});

test('unwinding below deadband', () => {
  const t = computeOiTrend(80, { oiNotional: 100, ts: NOW - 1000 }, NOW, 1.0);
  assert.equal(t.direction, 'unwinding');
  assert.ok(Math.abs(t.pctChange + 20) < 1e-9);
});

test('flat inside the deadband', () => {
  const t = computeOiTrend(100.5, { oiNotional: 100, ts: NOW - 1000 }, NOW, 1.0);
  assert.equal(t.direction, 'flat'); // 0.5% < 1.0% deadband
});

test('guards divide-by-zero reference', () => {
  const t = computeOiTrend(100, { oiNotional: 0, ts: NOW - 1000 }, NOW, 1.0);
  assert.equal(t.state, 'warming');
});
