// Pure OI-trend derivation (no I/O). Compares current OI notional against a
// reference sample taken ~OI_TREND_WINDOW_MS ago (SPEC §4.2 / §5.1).
// The reference comes from the in-memory map the snapshotter maintains, so this
// runs cheaply on every 2s poll without touching SQLite.

/**
 * @param {number|null} currentNotional  OI notional right now
 * @param {{oiNotional:number, ts:number}|undefined} ref  ~window-ago sample
 * @param {number} now            ms epoch (passed in to stay pure/testable)
 * @param {number} deadbandPct     |%| below which we call it "flat"
 * @returns {{state:string, direction:string|null, pctChange:number|null, refAgeMs:number|null}}
 *   state: 'ok' once we have a reference, else 'warming' (not enough history yet).
 *   direction: 'rising' | 'unwinding' | 'flat' | null
 */
export function computeOiTrend(currentNotional, ref, now, deadbandPct) {
  // No reference old enough yet (fresh start before the window has elapsed,
  // and no persisted snapshot that far back) — the UI shows "warming up".
  if (!ref || ref.oiNotional == null || ref.oiNotional === 0 || currentNotional == null) {
    return { state: 'warming', direction: null, pctChange: null, refAgeMs: null };
  }
  const pctChange = ((currentNotional - ref.oiNotional) / ref.oiNotional) * 100;
  let direction;
  if (Math.abs(pctChange) < deadbandPct) {
    direction = 'flat';
  } else {
    direction = pctChange > 0 ? 'rising' : 'unwinding';
  }
  return { state: 'ok', direction, pctChange, refAgeMs: now - ref.ts };
}
