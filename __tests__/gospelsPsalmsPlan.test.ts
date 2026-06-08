import { GOSPELS_PSALMS_PLAN, GOSPELS_PSALMS_TOTAL_DAYS } from '../src/constants/gospelsPsalmsPlan';

// Regression baseline for the 89-day Gospels & Psalms reading plan data.
// Catches future edits that break day count, gospel coverage, or reference
// validity — all of which would ship silently otherwise.

const PSALM_LENGTHS: Record<number, number> = {
  18: 50, 105: 45, 106: 48, 119: 176, // the ones we split; others only need 1..150 bound
};
const GOSPEL_CHAPTERS: Record<string, number> = { matthew: 28, mark: 16, luke: 24, john: 21 };

describe('GOSPELS_PSALMS_PLAN', () => {
  test('has exactly 89 days, contiguous and unique', () => {
    expect(GOSPELS_PSALMS_TOTAL_DAYS).toBe(89);
    expect(GOSPELS_PSALMS_PLAN).toHaveLength(89);
    const days = GOSPELS_PSALMS_PLAN.map(d => d.day);
    expect(days).toEqual(Array.from({ length: 89 }, (_, i) => i + 1));
  });

  test('gospel coverage is the full 89 chapters in canonical order', () => {
    const seen: Record<string, number[]> = { matthew: [], mark: [], luke: [], john: [] };
    for (const d of GOSPELS_PSALMS_PLAN) {
      expect(GOSPEL_CHAPTERS).toHaveProperty(d.gospel.bookSlug);
      seen[d.gospel.bookSlug].push(d.gospel.chapter);
    }
    for (const [slug, n] of Object.entries(GOSPEL_CHAPTERS)) {
      expect(seen[slug]).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  test('every psalm reference is within 1..150 and ranges are valid', () => {
    for (const d of GOSPELS_PSALMS_PLAN) {
      for (const p of [d.morningPsalm, d.eveningPsalm]) {
        expect(p.chapter).toBeGreaterThanOrEqual(1);
        expect(p.chapter).toBeLessThanOrEqual(150);
        if (p.vStart != null || p.vEnd != null) {
          expect(p.vStart).toBeGreaterThanOrEqual(1);
          expect(p.vEnd!).toBeGreaterThanOrEqual(p.vStart!);
          const max = PSALM_LENGTHS[p.chapter];
          if (max) expect(p.vEnd!).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  // Guards the content-quality regression flagged in audit (days 76-85 had
  // Psalm 1 ten nights in a row). No psalm should repeat on >4 evenings.
  test('no evening psalm chapter repeats excessively (content quality)', () => {
    const counts: Record<number, number> = {};
    for (const d of GOSPELS_PSALMS_PLAN) {
      counts[d.eveningPsalm.chapter] = (counts[d.eveningPsalm.chapter] ?? 0) + 1;
    }
    const offenders = Object.entries(counts).filter(([, c]) => c > 4);
    expect(offenders).toEqual([]);
  });
});
