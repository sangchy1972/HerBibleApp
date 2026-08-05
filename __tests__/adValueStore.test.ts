// The paid-event ledger — the atomic write-back the layer gates depend on.

import {
  recordPaidValue, adValueState, adValueStats,
  __resetAdValueStoreForTest, __sanitizeForTest,
} from '../src/services/adValueStore';

beforeEach(() => __resetAdValueStoreForTest());

describe('recordPaidValue', () => {
  it('keeps the spec invariant: imps ≥ k ⟺ window has min(k,3) entries', () => {
    expect(adValueState().imps).toBe(0);
    expect(adValueState().last3).toHaveLength(0);
    recordPaidValue(0.10);
    expect(adValueState().imps).toBe(1);
    expect(adValueState().last3).toEqual([0.10]);
    recordPaidValue(0.08);
    recordPaidValue(0.05);
    recordPaidValue(0.20);
    const s = adValueState();
    expect(s.imps).toBe(4);
    expect(s.last3).toEqual([0.08, 0.05, 0.20]);   // rolling, oldest dropped
  });

  it('stores RAW per-impression revenue — ltv and max are plain sums, no ×1000', () => {
    recordPaidValue(0.10);
    recordPaidValue(0.08);
    const s = adValueState();
    expect(s.ltv).toBeCloseTo(0.18);
    expect(s.max).toBeCloseTo(0.10);
  });

  it('a zero-value impression still counts (UNKNOWN-precision test traffic)', () => {
    recordPaidValue(0);
    expect(adValueState().imps).toBe(1);
    expect(adValueState().last3).toEqual([0]);
  });

  it('garbage never corrupts the ledger', () => {
    recordPaidValue(NaN);
    recordPaidValue(-5);
    const s = adValueState();
    expect(s.imps).toBe(2);          // impressions happened
    expect(s.ltv).toBe(0);           // money did not
    expect(s.last3).toEqual([0, 0]);
  });

  it('derived stats: mean and median over the retained history', () => {
    for (const v of [0.01, 0.02, 0.03, 0.10]) recordPaidValue(v);
    const { mean, median } = adValueStats();
    expect(mean).toBeCloseTo(0.04);
    expect(median).toBeCloseTo(0.025);
  });
});

describe('sanitize — corrupt snapshots fall back to the new-user flow', () => {
  it('accepts a consistent snapshot', () => {
    const s = __sanitizeForTest({ v: 1, imps: 4, last3: [0.1, 0.2, 0.3], max: 0.3, ltv: 0.7, values: [0.1, 0.2, 0.3, 0.1] });
    expect(s?.imps).toBe(4);
  });
  it('rejects an invariant violation outright — half-trust would strand the target formula', () => {
    expect(__sanitizeForTest({ v: 1, imps: 5, last3: [0.1], max: 0.1, ltv: 0.1, values: [] })).toBeNull();
    expect(__sanitizeForTest({ v: 1, imps: 1, last3: [0.1, 0.2, 0.3], max: 0.3, ltv: 0.6, values: [] })).toBeNull();
  });
  it('rejects the wrong version / shape', () => {
    expect(__sanitizeForTest(null)).toBeNull();
    expect(__sanitizeForTest({ v: 2 })).toBeNull();
    expect(__sanitizeForTest('x')).toBeNull();
  });
  it('filters non-numeric noise out of the arrays', () => {
    const s = __sanitizeForTest({ v: 1, imps: 2, last3: [0.1, 'x', 0.2], max: 0.2, ltv: 0.3, values: [0.1, null, 0.2] });
    // 'x' filtered → last3 = [0.1, 0.2] which matches min(imps,3) = 2 → accepted
    expect(s?.last3).toEqual([0.1, 0.2]);
    expect(s?.values).toEqual([0.1, 0.2]);
  });
});
