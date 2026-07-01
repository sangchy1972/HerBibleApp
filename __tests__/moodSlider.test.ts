import { indexToMood, moodToIndex, MOOD_SLIDER_ORDER, MOOD_COLOR, type Mood } from '../src/components/MoodEmoji';

describe('mood slider index ↔ mood', () => {
  it('has 9 moods in a fixed heavy→radiant order', () => {
    expect(MOOD_SLIDER_ORDER).toHaveLength(9);
    expect(MOOD_SLIDER_ORDER[0]).toBe('angry');       // heavy end
    expect(MOOD_SLIDER_ORDER[8]).toBe('blessed');     // radiant end
  });
  it('round-trips every index', () => {
    MOOD_SLIDER_ORDER.forEach((_, i) => {
      expect(moodToIndex(indexToMood(i))).toBe(i);
    });
  });
  it('round-trips every mood', () => {
    MOOD_SLIDER_ORDER.forEach((m) => {
      expect(indexToMood(moodToIndex(m))).toBe(m);
    });
  });
  it('clamps out-of-range and rounds fractional indices', () => {
    expect(indexToMood(-3)).toBe(MOOD_SLIDER_ORDER[0]);
    expect(indexToMood(99)).toBe(MOOD_SLIDER_ORDER[8]);
    expect(indexToMood(2.4)).toBe(MOOD_SLIDER_ORDER[2]);
    expect(indexToMood(2.6)).toBe(MOOD_SLIDER_ORDER[3]);
  });
  it('every mood has a calendar colour', () => {
    (MOOD_SLIDER_ORDER as Mood[]).forEach((m) => {
      expect(MOOD_COLOR[m]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
