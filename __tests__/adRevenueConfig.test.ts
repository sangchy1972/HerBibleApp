// The remote ad-revenue config: untrusted-input parsing + accumulator
// persistence.
//
// `ad-config.json` is hand-edited and CDN-served, so sanitize() is the boundary
// between a typo in a text file and every user's revenue reporting. And the
// persisted state is the ONLY thing stopping a same-day relaunch from firing
// today's AdLTV tiers a second time. Both were previously untested.

import AsyncStorage from '@react-native-async-storage/async-storage';

const logged: Array<{ name: string; params: any }> = [];
jest.mock('../src/services/firebase', () => ({
  logEvent: (name: string, params: any) => { logged.push({ name, params }); },
}));

import {
  __sanitizeForTest,
  __setConfigForTest,
  currentConfig,
} from '../src/services/adRevenueConfig';
import {
  onAdPaid,
  initAdRevenue,
  __resetAdRevenueForTest,
  __getAdRevenueState,
} from '../src/services/adRevenue';
import { DEFAULT_AD_REVENUE_CONFIG } from '../src/constants/adRevenueConfig';

beforeEach(async () => {
  logged.length = 0;
  __setConfigForTest(null);
  __resetAdRevenueForTest();
  await AsyncStorage.clear();   // __resetAdRevenueForTest does NOT clear it
});

describe('sanitize — a broken remote file must not break reporting', () => {
  it('rejects a non-object payload outright', () => {
    expect(__sanitizeForTest(null)).toBeNull();
    expect(__sanitizeForTest('nope')).toBeNull();
    expect(__sanitizeForTest(42)).toBeNull();
  });

  it('keeps known-good values for every field the payload omits', () => {
    const clean = __sanitizeForTest({ v: 9 })!;
    expect(clean.v).toBe(9);
    expect(clean.manualAdImpression).toEqual(DEFAULT_AD_REVENUE_CONFIG.manualAdImpression);
    expect(clean.totalRevenueStep.HKD).toBeCloseTo(DEFAULT_AD_REVENUE_CONFIG.totalRevenueStep.HKD);
    expect(clean.accountCurrency).toBe('HKD');
  });

  it('ignores a non-boolean manualAdImpression rather than coercing it', () => {
    // "false" (a string) is truthy in JS. Coercing it would silently switch
    // manual logging ON for a linked platform — instant double counting.
    const clean = __sanitizeForTest({ manualAdImpression: { ios: 'false', android: 1 } })!;
    expect(clean.manualAdImpression.ios).toBe(DEFAULT_AD_REVENUE_CONFIG.manualAdImpression.ios);
    expect(clean.manualAdImpression.android).toBe(DEFAULT_AD_REVENUE_CONFIG.manualAdImpression.android);
  });

  it('accepts a real per-platform flip', () => {
    const clean = __sanitizeForTest({ manualAdImpression: { ios: false, android: true } })!;
    expect(clean.manualAdImpression).toEqual({ ios: false, android: true });
  });

  it.each([0, -1, NaN, 1e-9, 'x', null])('rejects a bad step (%p)', (bad) => {
    const clean = __sanitizeForTest({ totalRevenueStep: { HKD: bad } })!;
    expect(clean.totalRevenueStep.HKD).toBeCloseTo(DEFAULT_AD_REVENUE_CONFIG.totalRevenueStep.HKD);
  });

  it('keeps the previous threshold table when the field is malformed', () => {
    // Half a table is not a safer table: silently collapsing to {} would switch
    // every AdLTV tier off with no signal that anything went wrong.
    __setConfigForTest({ adLtvThresholds: { HKD: { default: { top50: 1 } } } });
    const clean = __sanitizeForTest({ adLtvThresholds: 'oops' })!;
    expect(clean.adLtvThresholds.HKD.default.top50).toBe(1);
  });

  it('honours an explicit empty table (phase 1) as a real value', () => {
    __setConfigForTest({ adLtvThresholds: { HKD: { default: { top50: 1 } } } });
    const clean = __sanitizeForTest({ adLtvThresholds: {} })!;
    expect(clean.adLtvThresholds).toEqual({});
  });

  it('preserves null as "tier disabled" but drops junk tier values', () => {
    const clean = __sanitizeForTest({
      adLtvThresholds: { HKD: { default: { top50: 0.5, top30: null, top20: -1, top10: 'x' } } },
    })!;
    const row = clean.adLtvThresholds.HKD.default;
    expect(row.top50).toBe(0.5);
    expect(row.top30).toBeNull();
    expect(row.top20).toBeUndefined();
    expect(row.top10).toBeUndefined();
  });

  it('rejects an accountCurrency that is not ISO-4217', () => {
    expect(__sanitizeForTest({ accountCurrency: 'DOLLARS' })!.accountCurrency).toBe('HKD');
    expect(__sanitizeForTest({ accountCurrency: 'usd' })!.accountCurrency).toBe('USD');
  });

  it('leaves the live config untouched until it is applied', () => {
    __sanitizeForTest({ accountCurrency: 'USD' });
    expect(currentConfig().accountCurrency).toBe('HKD');
  });
});

describe('persistence round-trip', () => {
  const pay = (v: number) =>
    onAdPaid({ value: v, currency: 'HKD', format: 'interstitial', adUnitName: 'u' });

  it('does not re-fire today\'s AdLTV tiers after a relaunch', async () => {
    __setConfigForTest({
      totalRevenueStep: { HKD: 0.078 },
      adLtvThresholds: { HKD: { default: { top50: 0.1, top30: 5 } } },
    });
    pay(0.5);
    expect(logged.filter(e => e.name === 'AdLTV_OneDay_Top50Percent')).toHaveLength(1);

    // A tier is irreversible, so it flushes immediately rather than waiting on
    // the 1s debounce — simulate the relaunch without advancing timers.
    __resetAdRevenueForTest();
    logged.length = 0;
    await initAdRevenue();

    expect(__getAdRevenueState().total).toBeCloseTo(0.5);
    expect(__getAdRevenueState().fired).toContain('top50');
    pay(0.5);
    expect(logged.filter(e => e.name === 'AdLTV_OneDay_Top50Percent')).toHaveLength(0);
  });

  it('resets daily state but inherits the carry across a relaunch on a new day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 25, 12, 0, 0));
    __setConfigForTest({
      totalRevenueStep: { HKD: 0.078 },
      adLtvThresholds: { HKD: { default: { top50: 0.1 } } },
    });
    pay(0.5);                       // fires top50, leaves carry 0.5 - 6×0.078
    const carryBefore = __getAdRevenueState().carry;
    expect(carryBefore).toBeGreaterThan(0);

    __resetAdRevenueForTest();
    logged.length = 0;
    jest.setSystemTime(new Date(2026, 6, 26, 9, 0, 0));
    await initAdRevenue();

    const s = __getAdRevenueState();
    expect(s.total).toBe(0);                    // daily total resets
    expect(s.fired).toEqual([]);                // tiers re-arm
    expect(s.carry).toBeCloseTo(carryBefore);   // micro-accumulator survives
    jest.useRealTimers();
  });

  it('starts clean on a corrupt cache instead of throwing', async () => {
    await AsyncStorage.setItem('ad-revenue-state:v1', '{not json');
    await expect(initAdRevenue()).resolves.toBeUndefined();
    expect(__getAdRevenueState().total).toBe(0);
  });

  it('drops unknown tier names read back from disk', async () => {
    await AsyncStorage.setItem(
      'ad-revenue-state:v1',
      JSON.stringify({ day: __getAdRevenueState().day, total: 1, carry: 0, fired: ['top50', 'evil'], currency: 'HKD' }),
    );
    await initAdRevenue();
    expect(__getAdRevenueState().fired).toEqual(['top50']);
  });
});
