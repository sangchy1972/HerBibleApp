// Cadence for the proactive remove-ads pitch. Getting this wrong either nags a
// payer or never pitches at all, so every branch is pinned.

import {
  removeAdsShouldAsk, daysBetweenYmd,
  REMOVE_ADS_REPEAT_DAYS, REMOVE_ADS_SECOND_ASK_DAY,
} from '../src/state/removeAdsPrompt';

const S = (over: Partial<Parameters<typeof removeAdsShouldAsk>[0]> = {}) => ({
  activeDays: 2, lastAskYmd: '', lastAdDayYmd: '', ...over,
});

describe('removeAdsShouldAsk', () => {
  it('a payer is never pitched again', () => {
    expect(removeAdsShouldAsk(S(), '2026-08-09', true)).toBe(false);
  });

  it('day one belongs to onboarding — no proactive ask', () => {
    expect(removeAdsShouldAsk(S({ activeDays: 1 }), '2026-08-08', false)).toBe(false);
    expect(REMOVE_ADS_SECOND_ASK_DAY).toBe(2);
  });

  it('fires on the SECOND active day', () => {
    expect(removeAdsShouldAsk(S({ activeDays: 2 }), '2026-08-09', false)).toBe(true);
  });

  it('a skipped day 2 does not lose the ask — it waits for her next active day', () => {
    // Installed Monday, next opened Friday: Friday IS her 2nd active day.
    expect(removeAdsShouldAsk(S({ activeDays: 2 }), '2026-08-14', false)).toBe(true);
  });

  it('only the FIRST ad of the day can trigger it', () => {
    expect(removeAdsShouldAsk(S({ lastAdDayYmd: '2026-08-09' }), '2026-08-09', false)).toBe(false);
    expect(removeAdsShouldAsk(S({ lastAdDayYmd: '2026-08-08' }), '2026-08-09', false)).toBe(true);
  });

  it('after the second ask it repeats every 7 days, not sooner', () => {
    const asked = { activeDays: 9, lastAskYmd: '2026-08-09', lastAdDayYmd: '' };
    expect(removeAdsShouldAsk(asked, '2026-08-10', false)).toBe(false);
    expect(removeAdsShouldAsk(asked, '2026-08-15', false)).toBe(false);   // 6 days
    expect(removeAdsShouldAsk(asked, '2026-08-16', false)).toBe(true);    // 7 days
    expect(removeAdsShouldAsk(asked, '2026-09-30', false)).toBe(true);
    expect(REMOVE_ADS_REPEAT_DAYS).toBe(7);
  });

  it('a garbage stored date must not lock the pitch out forever', () => {
    // daysBetweenYmd returns Infinity → >= 7 → eligible, which is the safe
    // direction (a pitch, not permanent silence).
    expect(removeAdsShouldAsk({ activeDays: 5, lastAskYmd: 'oops', lastAdDayYmd: '' }, '2026-08-16', false)).toBe(true);
  });
});

describe('daysBetweenYmd', () => {
  it('counts whole local days, across a month boundary', () => {
    expect(daysBetweenYmd('2026-08-09', '2026-08-16')).toBe(7);
    expect(daysBetweenYmd('2026-07-31', '2026-08-01')).toBe(1);
    expect(daysBetweenYmd('2026-08-09', '2026-08-09')).toBe(0);
  });
  it('survives a DST transition — rounds, never floors to N-1', () => {
    // US spring-forward 2026-03-08: the 7-day gap is 7 days minus an hour.
    expect(daysBetweenYmd('2026-03-05', '2026-03-12')).toBe(7);
  });
  it('unparseable input → Infinity (eligible, the safe direction)', () => {
    expect(daysBetweenYmd('', '2026-08-16')).toBe(Infinity);
    expect(daysBetweenYmd('2026-8-9', '2026-08-16')).toBe(Infinity);
  });
});
