// Impression-level ad revenue funnel (services/adRevenue).
//
// This is money-adjacent analytics: a wrong threshold or a double-fire teaches
// Google Ads to bid on a bogus signal, and the damage is invisible until the
// campaign has already spent. So the rules are pinned here rather than trusted
// to review.

import { Platform } from 'react-native';

const logged: Array<{ name: string; params: any }> = [];
jest.mock('../src/services/firebase', () => ({
  logEvent: (name: string, params: any) => { logged.push({ name, params }); },
}));

import {
  onAdPaid,
  normalizeValue,
  normalizeCurrency,
  __resetAdRevenueForTest,
  __getAdRevenueState,
} from '../src/services/adRevenue';
import { __setConfigForTest } from '../src/services/adRevenueConfig';

const namesOf = (n: string) => logged.filter(e => e.name === n);
const pay = (value: number, currency = 'HKD') =>
  onAdPaid({ value, currency, format: 'interstitial', adUnitName: 'ww_interstitial' });

beforeEach(() => {
  logged.length = 0;
  __resetAdRevenueForTest();
  __setConfigForTest(null);
  (Platform as any).OS = 'android';
});

// ── value / currency normalisation ──────────────────────────────────────────
describe('normalizeValue', () => {
  it('passes through plain numbers', () => {
    expect(normalizeValue(0.0042)).toBeCloseTo(0.0042);
    expect(normalizeValue(0)).toBe(0);
  });

  it('recovers a locale-comma decimal ("0,004" on a German device)', () => {
    // Number("0,004") is NaN — without the swap the impression silently
    // vanishes from the accumulators.
    expect(normalizeValue('0,004')).toBeCloseTo(0.004);
  });

  it('treats commas as grouping when a dot is already present', () => {
    expect(normalizeValue('1,234.5')).toBeCloseTo(1234.5);
  });

  it('floors garbage and negatives to 0 rather than poisoning the total', () => {
    expect(normalizeValue('abc')).toBe(0);
    expect(normalizeValue(undefined)).toBe(0);
    expect(normalizeValue(null)).toBe(0);
    expect(normalizeValue(-5)).toBe(0);
    expect(normalizeValue(NaN)).toBe(0);
    expect(normalizeValue(Infinity)).toBe(0);
  });
});

describe('normalizeCurrency', () => {
  it('upper-cases a valid ISO-4217 code', () => {
    expect(normalizeCurrency('hkd')).toBe('HKD');
  });

  it('rejects anything that is not exactly three letters', () => {
    // Never guess USD here: a bad code must not silently pick up USD-denominated
    // thresholds while the values are actually HKD.
    expect(normalizeCurrency('US')).toBe('');
    expect(normalizeCurrency('DOLLAR')).toBe('');
    expect(normalizeCurrency(undefined)).toBe('');
  });
});

// ── ad_impression ownership ─────────────────────────────────────────────────
describe('ad_impression — exactly one producer', () => {
  it('stays silent on Android, where the AdMob↔Firebase link auto-collects it', () => {
    __setConfigForTest({ manualAdImpression: { ios: true, android: false } });
    (Platform as any).OS = 'android';
    pay(1);
    expect(namesOf('ad_impression')).toHaveLength(0);
  });

  it('logs on iOS, where the link is off and nobody else would', () => {
    __setConfigForTest({ manualAdImpression: { ios: true, android: false } });
    (Platform as any).OS = 'ios';
    pay(1);
    expect(namesOf('ad_impression')).toHaveLength(1);
  });

  it('carries the exact param keys Google Ads reads', () => {
    // Explicit, not relying on the baked-in default staying true.
    __setConfigForTest({ manualAdImpression: { ios: true, android: true } });
    (Platform as any).OS = 'ios';
    pay(0.5, 'HKD');
    const p = namesOf('ad_impression')[0].params;
    expect(p.value).toBeCloseTo(0.5);
    expect(p.currency).toBe('HKD');
    expect(p.ad_platform).toBe('admob');
    expect(p.ad_source).toBe('admob_mediation');
    expect(p.ad_format).toBe('interstitial');
    expect(p.ad_unit_name).toBe('ww_interstitial');
  });

  it('still reports a zero-value impression but accrues nothing from it', () => {
    // Bidding ad sources on a test request return precision=UNKNOWN, value=0.
    (Platform as any).OS = 'ios';
    __setConfigForTest({ totalRevenueStep: { HKD: 0.078, default: 0.01 } });
    pay(0);
    expect(namesOf('ad_impression')).toHaveLength(1);
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(0);
    expect(__getAdRevenueState().total).toBe(0);
  });

  it('falls back to the ACCOUNT currency, never USD, on an unusable code', () => {
    // `value` is denominated in the account's currency whatever the code says.
    // Stamping USD on an HKD amount would inflate its apparent worth ~7.8×
    // through every downstream Google Ads bid.
    (Platform as any).OS = 'ios';
    onAdPaid({ value: 1, currency: 'XX', format: 'interstitial', adUnitName: 'u' });
    expect(namesOf('ad_impression')[0].params.currency).toBe('HKD');
  });
});

// ── Total_Ads_Revenue_001 ───────────────────────────────────────────────────
describe('Total_Ads_Revenue_001 — micro-threshold roll-up', () => {
  beforeEach(() => {
    __setConfigForTest({ totalRevenueStep: { HKD: 0.078, default: 0.01 } });
  });

  it('swallows sub-threshold impressions', () => {
    pay(0.01); pay(0.02); pay(0.03);   // 0.06 < 0.078
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(0);
  });

  it('fires once when the carry crosses the step', () => {
    pay(0.05); pay(0.05);              // 0.10 ≥ 0.078
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(1);
  });

  it('fires N times for one impression worth N steps', () => {
    pay(0.078 * 3);
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(3);
  });

  it('keeps the remainder rather than discarding it', () => {
    pay(0.078 + 0.05);
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(1);
    expect(__getAdRevenueState().carry).toBeCloseTo(0.05);
    pay(0.03);                         // 0.08 ≥ 0.078 → second fire
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(2);
  });

  it('uses the currency-specific step, not a USD number against HKD values', () => {
    // The whole point of keying by currency: HK$0.02 must NOT clear a US$0.01
    // step. Getting this wrong fires on nearly every impression.
    pay(0.02, 'HKD');
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(0);
  });

  it('applies the default step for an unlisted currency', () => {
    pay(0.02, 'EUR');                  // default step 0.01 → 2 fires
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(2);
  });
});

// ── AdLTV tiers ─────────────────────────────────────────────────────────────
describe('AdLTV_OneDay_TopNPercent', () => {
  const withThresholds = () =>
    __setConfigForTest({
      totalRevenueStep: { HKD: 0.078, default: 0.01 },
      adLtvThresholds: {
        HKD: { default: { top50: 0.1, top30: 0.5, top20: 1.0, top10: 2.0 } },
      },
    });

  it('stays silent while thresholds are unset (phase 1)', () => {
    __setConfigForTest({ adLtvThresholds: {} });
    pay(100);
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(0);
    expect(namesOf('AdLTV_OneDay_Top10Percent')).toHaveLength(0);

    // Positive control: the same payment DOES fire once thresholds exist, so
    // this test fails if the AdLTV block is deleted rather than passing
    // vacuously.
    __resetAdRevenueForTest();
    logged.length = 0;
    withThresholds();
    pay(100);
    expect(namesOf('AdLTV_OneDay_Top10Percent')).toHaveLength(1);
  });

  it('fires cheapest-first when one impression clears several tiers', () => {
    withThresholds();
    pay(1.2);
    const order = logged.filter(e => e.name.startsWith('AdLTV_')).map(e => e.name);
    expect(order).toEqual([
      'AdLTV_OneDay_Top50Percent',
      'AdLTV_OneDay_Top30Percent',
      'AdLTV_OneDay_Top20Percent',
    ]);
    expect(namesOf('AdLTV_OneDay_Top10Percent')).toHaveLength(0);
  });

  it('fires each tier at most once per day', () => {
    withThresholds();
    pay(0.2); pay(0.2); pay(0.2);
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(1);
  });

  it('crosses higher tiers as the day accumulates', () => {
    withThresholds();
    pay(0.15);
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(1);
    expect(namesOf('AdLTV_OneDay_Top30Percent')).toHaveLength(0);
    pay(0.4);                          // total 0.55 ≥ 0.5
    expect(namesOf('AdLTV_OneDay_Top30Percent')).toHaveLength(1);
  });

  it('treats an explicit null as "tier disabled"', () => {
    __setConfigForTest({
      adLtvThresholds: { HKD: { default: { top50: 0.1, top30: null } } },
    });
    pay(5);
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(1);
    expect(namesOf('AdLTV_OneDay_Top30Percent')).toHaveLength(0);
  });

  it('ignores a threshold table written in a different currency', () => {
    __setConfigForTest({ adLtvThresholds: { USD: { default: { top50: 0.1 } } } });
    pay(5, 'HKD');
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(0);
  });
});

// ── day boundary + currency switch ──────────────────────────────────────────
describe('daily reset', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('clears totals and re-arms every tier at local midnight', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 25, 23, 59, 0));   // local, not UTC
    __setConfigForTest({
      totalRevenueStep: { HKD: 0.078 },
      adLtvThresholds: { HKD: { default: { top50: 0.1 } } },
    });
    pay(0.5);
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(1);
    expect(__getAdRevenueState().total).toBeCloseTo(0.5);

    jest.setSystemTime(new Date(2026, 6, 26, 0, 1, 0));
    pay(0.5);
    // Same tier again — it is a ONE-DAY tier, so a new day must re-arm it.
    expect(namesOf('AdLTV_OneDay_Top50Percent')).toHaveLength(2);
    expect(__getAdRevenueState().total).toBeCloseTo(0.5);
  });

  it('carries unbanked micro-revenue ACROSS midnight', () => {
    // `carry` is progress toward a LIFETIME counter, not a daily one. Zeroing
    // it at midnight quietly bins up to a full step of already-earned revenue
    // per user per day, and it can never be recovered.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 25, 23, 59, 0));
    __setConfigForTest({ totalRevenueStep: { HKD: 0.078 } });
    pay(0.05);                                     // below the step → banked in carry
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(0);
    expect(__getAdRevenueState().carry).toBeCloseTo(0.05);

    jest.setSystemTime(new Date(2026, 6, 26, 0, 1, 0));
    pay(0.03);                                     // 0.05 + 0.03 = 0.08 ≥ 0.078
    expect(namesOf('Total_Ads_Revenue_001')).toHaveLength(1);
    expect(__getAdRevenueState().total).toBeCloseTo(0.03);   // daily total did reset
  });

  it('restarts the day if the account currency changes mid-day', () => {
    __setConfigForTest({ totalRevenueStep: { HKD: 0.078, USD: 0.01 } });
    pay(1, 'HKD');
    expect(__getAdRevenueState().total).toBeCloseTo(1);
    pay(0.05, 'USD');
    // Comparing a USD running total against an HKD one is meaningless, so the
    // accumulator restarts instead of silently mixing the two.
    expect(__getAdRevenueState().currency).toBe('USD');
    expect(__getAdRevenueState().total).toBeCloseTo(0.05);
  });
});

// ── robustness ──────────────────────────────────────────────────────────────
describe('never throws out of an ad callback', () => {
  it('survives a malformed payload', () => {
    expect(() => onAdPaid({} as any)).not.toThrow();
    expect(() => onAdPaid(null as any)).not.toThrow();
    expect(() =>
      onAdPaid({ value: {}, currency: [], format: 'x', adUnitName: 'y' } as any),
    ).not.toThrow();
  });

  it('does not spin forever on a corrupt (tiny) step', () => {
    __setConfigForTest({ totalRevenueStep: { HKD: 1e-9 } });
    const t0 = Date.now();
    pay(1000);
    expect(Date.now() - t0).toBeLessThan(2000);
    // Bounded at 100 events rather than ~1e12.
    expect(namesOf('Total_Ads_Revenue_001').length).toBeLessThanOrEqual(100);
  });

  it('drains the carry when it hits the cap, so the flood cannot repeat', () => {
    // Capping each CALL is not enough: if the untouched remainder stays in
    // `carry`, the very next impression hits the cap again — an unbounded
    // event flood across the whole user base rather than a bounded one.
    __setConfigForTest({ totalRevenueStep: { HKD: 1e-9 } });
    pay(1000); pay(1000); pay(1000);
    expect(namesOf('Total_Ads_Revenue_001').length).toBeLessThanOrEqual(100 * 3);
    expect(__getAdRevenueState().carry).toBe(0);
    expect(namesOf('ad_revenue_step_overflow').length).toBeGreaterThan(0);
  });

  it('refuses an implausibly small step from the remote file', () => {
    // sanitize() should reject it outright; stepForCurrency then falls back to
    // the safe baked-in default instead of honouring an obvious typo.
    const { __sanitizeForTest } = require('../src/services/adRevenueConfig');
    const clean = __sanitizeForTest({ totalRevenueStep: { HKD: 1e-9 } });
    expect(clean.totalRevenueStep.HKD).toBeGreaterThanOrEqual(0.001);
  });
});
