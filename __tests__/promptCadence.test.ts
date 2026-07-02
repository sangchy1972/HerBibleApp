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
  it('escalating gap 3,4,… capped at 7 days', () => {
    expect(setReminderShouldShow({ baselineAt: NOW, lastShownAt: NOW, promptCount: 1, configured: false }, NOW + 3 * DAY)).toBe(true);
    expect(setReminderShouldShow({ baselineAt: NOW, lastShownAt: NOW, promptCount: 10, configured: false }, NOW + 6 * DAY)).toBe(false);
    expect(setReminderShouldShow({ baselineAt: NOW, lastShownAt: NOW, promptCount: 10, configured: false }, NOW + 7 * DAY)).toBe(true);
  });
});
