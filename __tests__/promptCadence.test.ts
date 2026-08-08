import { rateShouldAsk } from '../src/state/RatePromptContext';
import { setReminderShouldShow } from '../src/state/SetReminderTimeContext';

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;

describe('rateShouldAsk — denser cadence', () => {
  it('first time (no prompt yet) asks', () => {
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: 0, promptCount: 0 }, NOW)).toBe(true);
  });
  it('Yes → never again', () => {
    expect(rateShouldAsk({ rated: false, choice: 'yes', lastShownAt: NOW, promptCount: 1 }, NOW + 999 * DAY)).toBe(false);
  });
  it('rated → never again', () => {
    expect(rateShouldAsk({ rated: true, choice: 'none', lastShownAt: 0, promptCount: 0 }, NOW)).toBe(false);
  });
  it('No → asks again after ~30 days', () => {
    const s = { rated: false, choice: 'no' as const, lastShownAt: NOW, promptCount: 1 };
    expect(rateShouldAsk(s, NOW + 29 * DAY)).toBe(false);
    expect(rateShouldAsk(s, NOW + 30 * DAY)).toBe(true);
  });
  it('dismissed → escalating gap 3,4,5,… capped at 15', () => {
    // promptCount 1 → gap 3 days
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: NOW, promptCount: 1 }, NOW + 2 * DAY)).toBe(false);
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: NOW, promptCount: 1 }, NOW + 3 * DAY)).toBe(true);
    // promptCount 5 → gap 7 days
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: NOW, promptCount: 5 }, NOW + 7 * DAY)).toBe(true);
    // promptCount 20 → gap capped at 15
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: NOW, promptCount: 20 }, NOW + 14 * DAY)).toBe(false);
    expect(rateShouldAsk({ rated: false, choice: 'none', lastShownAt: NOW, promptCount: 20 }, NOW + 15 * DAY)).toBe(true);
  });
});

describe('setReminderShouldShow — cadence', () => {
  it('never before a baseline is set', () => {
    expect(setReminderShouldShow({ baselineAt: 0, lastShownAt: 0, promptCount: 0, configured: false }, NOW)).toBe(false);
  });
  it('first show ~20h after baseline', () => {
    const s = { baselineAt: NOW, lastShownAt: 0, promptCount: 0, configured: false };
    expect(setReminderShouldShow(s, NOW + 19 * 3_600_000)).toBe(false);
    expect(setReminderShouldShow(s, NOW + 21 * 3_600_000)).toBe(true);
  });
  it('configured → never again', () => {
    expect(setReminderShouldShow({ baselineAt: NOW, lastShownAt: NOW, promptCount: 3, configured: true }, NOW + 99 * DAY)).toBe(false);
  });
  // Owner 2026-08-08: the escalating 3-to-7-day gap is gone. Once the first ask
  // has happened it re-asks EVERY DAY while notifications stay off, at most once
  // per local calendar day.
  it('re-asks once per calendar day, never twice in one day', () => {
    const shown = new Date(2026, 7, 8, 9, 0).getTime();
    const sameDayLater = new Date(2026, 7, 8, 23, 30).getTime();
    const nextDayEarly = new Date(2026, 7, 9, 0, 30).getTime();
    const s = { baselineAt: shown - 40 * 3_600_000, lastShownAt: shown, promptCount: 1, configured: false };
    expect(setReminderShouldShow(s, sameDayLater)).toBe(false);
    expect(setReminderShouldShow(s, nextDayEarly)).toBe(true);
  });

  it('a CALENDAR day, not a rolling 24h - the ask cannot drift out of her session', () => {
    // 09:00 yesterday to 08:00 today is only 23h, but it IS a new day: still asks.
    const shown = new Date(2026, 7, 8, 9, 0).getTime();
    const nextMorning = new Date(2026, 7, 9, 8, 0).getTime();
    expect(setReminderShouldShow(
      { baselineAt: shown - 40 * 3_600_000, lastShownAt: shown, promptCount: 4, configured: false },
      nextMorning,
    )).toBe(true);
  });

  it('the prompt count no longer changes the cadence', () => {
    const shown = new Date(2026, 7, 8, 9, 0).getTime();
    const tomorrow = new Date(2026, 7, 9, 9, 0).getTime();
    for (const promptCount of [1, 3, 10, 99]) {
      expect(setReminderShouldShow(
        { baselineAt: shown - 40 * 3_600_000, lastShownAt: shown, promptCount, configured: false },
        tomorrow,
      )).toBe(true);
    }
  });
});
