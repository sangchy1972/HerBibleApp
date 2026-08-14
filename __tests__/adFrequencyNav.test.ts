// Pure-reducer tests for the two navigation ad triggers.
//
// `reduceNavigation` is the only place the churn rule (owner 2026-08-09: >5
// switches AND ≥60s since the last ad) and the legacy every-3rd-transition rule
// meet. They count differently, threshold differently and have different quiet
// periods, so their interaction on a shared event is exactly what needs pinning.
//
// adFrequency imports react-native's AppState + AsyncStorage + ads at module
// scope, so the module is mocked away below and only the pure export is exercised.

jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'active' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: async () => null, setItem: async () => {} }));
jest.mock('../src/services/ads', () => ({ maybeShowInterstitial: jest.fn() }));
jest.mock('../src/services/interstitialVisibility', () => ({
  msSinceLastInterstitial: () => 0,
  isInterstitialVisible: () => false,
}));

import { reduceNavigation, shouldFireHotStart, type NavCounters } from '../src/services/adFrequency';

const FRESH: NavCounters = { navCount: 0, churnCount: 0, lastWasTabSwitch: false };
const QUIET = 999_999;   // well past the 60s churn floor
const NOISY = 5_000;     // an ad showed 5s ago

/** Walk a route list, returning every ad the walk earned. */
function walk(routes: string[], opts: { aggressive: boolean; msSinceAd: number }) {
  let s = FRESH;
  const shows: (string | null)[] = [];
  for (let i = 1; i < routes.length; i++) {
    const r = reduceNavigation(s, routes[i - 1], routes[i], opts);
    s = r.next;
    if (r.show) shows.push(r.show);
  }
  return { shows, state: s };
}

const TABS = ['prayer', 'bible', 'plan', 'profile'];
/** n consecutive tab switches, starting from `prayer`. */
function tabHops(n: number): string[] {
  return Array.from({ length: n + 1 }, (_, i) => TABS[i % TABS.length]);
}

describe('churn rule: >5 switches AND ≥60s quiet', () => {
  it('does NOT fire on the 5th switch — "more than 5" means more than 5', () => {
    const { shows } = walk(tabHops(5), { aggressive: false, msSinceAd: QUIET });
    expect(shows).toEqual([]);
  });

  it('fires on the 6th switch', () => {
    const { shows } = walk(tabHops(6), { aggressive: false, msSinceAd: QUIET });
    expect(shows).toEqual(['nav_churn']);
  });

  it('monetizes a pure tab run, which the legacy rule collapses to +1 and never fires on', () => {
    // The whole reason this rule exists: 12 tab taps, day ≥ 3, legacy rule silent.
    const { shows } = walk(tabHops(12), { aggressive: true, msSinceAd: QUIET });
    expect(shows).toContain('nav_churn');
    expect(shows).not.toContain('nav');
  });

  it('counts every switch — no tab-run collapsing', () => {
    const { state } = walk(tabHops(4), { aggressive: true, msSinceAd: QUIET });
    expect(state.churnCount).toBe(4);   // legacy collapse would have said 1
    expect(state.navCount).toBe(1);     // …and the legacy counter still does
  });

  it('stays SILENT inside the quiet minute even past the threshold', () => {
    const { shows, state } = walk(tabHops(20), { aggressive: false, msSinceAd: NOISY });
    expect(shows).toEqual([]);
    expect(state.churnCount).toBe(20);  // armed and climbing, not reset
  });

  it('fires on the first switch after the minute clears, without re-earning all 6', () => {
    let s = FRESH;
    for (let i = 1; i < tabHops(20).length; i++) {
      s = reduceNavigation(s, tabHops(20)[i - 1], tabHops(20)[i], { aggressive: false, msSinceAd: NOISY }).next;
    }
    const r = reduceNavigation(s, 'prayer', 'bible', { aggressive: false, msSinceAd: QUIET });
    expect(r.show).toBe('nav_churn');
    expect(r.next.churnCount).toBe(0);
  });

  it('has no day gate — a day-0 user churning still earns one', () => {
    const { shows } = walk(tabHops(6), { aggressive: false, msSinceAd: QUIET });
    expect(shows).toEqual(['nav_churn']);
  });

  it('re-arms after firing: the next 6 switches earn another', () => {
    const { shows } = walk(tabHops(12), { aggressive: false, msSinceAd: QUIET });
    expect(shows).toEqual(['nav_churn', 'nav_churn']);
  });
});

describe('exclusions apply to BOTH counters', () => {
  it('never counts a transition touching a flow screen', () => {
    const { shows, state } = walk(
      ['prayer', 'PrayerFlow', 'prayer', 'PlanDayWalk', 'plan', 'Quiz', 'plan', 'RemoveAds', 'profile'],
      { aggressive: true, msSinceAd: QUIET },
    );
    expect(shows).toEqual([]);
    expect(state.churnCount).toBe(0);
    expect(state.navCount).toBe(0);
  });

  it('an excluded screen breaks the tab run, so the legacy counter stops collapsing', () => {
    // prayer→bible collapses on the second hop; Streak breaks it; the next tab
    // pair is a fresh run and counts again.
    const { state } = walk(['prayer', 'bible', 'plan', 'PrayerFlow', 'plan', 'bible'], {
      aggressive: true, msSinceAd: QUIET,
    });
    expect(state.navCount).toBe(2);     // one per run
    expect(state.churnCount).toBe(3);   // PrayerFlow's two transitions never counted
  });

  it('ignores a no-op transition and the very first route', () => {
    expect(reduceNavigation(FRESH, null, 'prayer', { aggressive: true, msSinceAd: QUIET }).next).toEqual(FRESH);
    expect(reduceNavigation(FRESH, 'prayer', 'prayer', { aggressive: true, msSinceAd: QUIET }).next).toEqual(FRESH);
  });
});

describe('legacy nav rule is unchanged', () => {
  it('fires every 3rd non-tab-run transition for day ≥ 3', () => {
    const { shows } = walk(['prayer', 'Streak', 'prayer', 'Achievement', 'prayer', 'Streak'], {
      aggressive: true, msSinceAd: QUIET,
    });
    expect(shows).toEqual(['nav']);
  });

  it('never fires for a gentle-tier (day 0–2) user', () => {
    const { shows, state } = walk(['prayer', 'Streak', 'prayer', 'Achievement', 'prayer', 'Streak'], {
      aggressive: false, msSinceAd: QUIET,
    });
    expect(shows).toEqual([]);
    expect(state.navCount).toBe(0);
  });

  it('is NOT gated on the churn rule 60s floor', () => {
    const { shows } = walk(['prayer', 'Streak', 'prayer', 'Achievement', 'prayer', 'Streak'], {
      aggressive: true, msSinceAd: NOISY,
    });
    expect(shows).toEqual(['nav']);   // its own floor is the 30s global one, enforced in ads
  });
});

describe('when both rules are due on one transition', () => {
  it('asks for exactly one ad, and resets both counters', () => {
    // 5 mixed transitions gets churn to 5 and nav to 5; the 6th makes both due.
    const routes = ['prayer', 'Streak', 'prayer', 'Achievement', 'prayer', 'Streak', 'prayer'];
    let s = FRESH;
    const shows: string[] = [];
    for (let i = 1; i < routes.length; i++) {
      const r = reduceNavigation(s, routes[i - 1], routes[i], { aggressive: true, msSinceAd: QUIET });
      s = r.next;
      if (r.show) shows.push(r.show);
    }
    // nav fires at 3 (and resets), churn at 6. Never two on one transition.
    expect(shows).toEqual(['nav', 'nav_churn']);
    expect(s.churnCount).toBe(0);
    expect(s.navCount).toBe(0);   // consumed, not left ≥ NAV_EVERY re-firing forever
  });

  it('leaves no counter parked above its threshold', () => {
    // 30 transitions of every shape; neither counter may end up stuck at/over
    // its threshold, which would make every later transition try to fire.
    const routes = ['prayer'];
    for (let i = 0; i < 30; i++) routes.push(i % 3 === 0 ? 'Streak' : TABS[i % 4]);
    const { state } = walk(routes, { aggressive: true, msSinceAd: QUIET });
    expect(state.navCount).toBeLessThan(3);
    expect(state.churnCount).toBeLessThanOrEqual(5);
  });
});

describe('hot start: when a foreground-return may show app_open', () => {
  // The 2026-08-14 report: night prayer → Amen → THREE ads. On Android an
  // interstitial is its own activity, so showing one backgrounds the app and
  // closing it foregrounds it — and a ≥30s creative satisfied both the 15s
  // hot-start threshold and the 30s global floor, chaining app_open off every
  // ad close. The adCausedBg veto is what breaks that chain.
  const T = 1_000_000;

  it('never fires when the backgrounding was our own ad — however long the creative ran', () => {
    expect(shouldFireHotStart({ bgAt: T, now: T + 35_000, suppressedUntil: 0, adCausedBg: true })).toBe(false);
    expect(shouldFireHotStart({ bgAt: T, now: T + 600_000, suppressedUntil: 0, adCausedBg: true })).toBe(false);
  });

  it('fires on a genuine backgrounding of ≥15s', () => {
    expect(shouldFireHotStart({ bgAt: T, now: T + 15_000, suppressedUntil: 0, adCausedBg: false })).toBe(true);
    expect(shouldFireHotStart({ bgAt: T, now: T + 120_000, suppressedUntil: 0, adCausedBg: false })).toBe(true);
  });

  it('stays quiet under 15s — a quick app switch is not a hot start', () => {
    expect(shouldFireHotStart({ bgAt: T, now: T + 14_999, suppressedUntil: 0, adCausedBg: false })).toBe(false);
  });

  it('honours the store-review excursion window', () => {
    expect(shouldFireHotStart({ bgAt: T, now: T + 60_000, suppressedUntil: T + 61_000, adCausedBg: false })).toBe(false);
    // …and an expired window no longer vetoes.
    expect(shouldFireHotStart({ bgAt: T, now: T + 60_000, suppressedUntil: T + 1_000, adCausedBg: false })).toBe(true);
  });

  it('never fires without a background episode at all', () => {
    expect(shouldFireHotStart({ bgAt: null, now: T, suppressedUntil: 0, adCausedBg: false })).toBe(false);
  });
});
