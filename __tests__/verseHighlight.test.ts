import { buildSegments, isSegmentActive } from '../src/services/verseHighlight';

// Option-B matcher: keep the displayed text, map spoken sentences onto it.
// Mirrors the real e_001 John 14:1 data the audit verified.

const SCRIPTURE = 'Do not let your hearts be troubled. You believe in God; believe also in me.';
const SCRIPTURE_TIMINGS = [
  { text: 'Do not let your hearts be troubled.', start: 0, end: 2.659 },
  { text: 'You believe in God; believe also in me.', start: 3.355, end: 8.8 },
  { text: 'John chapter fourteen, verse one.', start: 9.404, end: 13.038 }, // spoken-only reference
];

describe('buildSegments', () => {
  test('maps each spoken sentence onto the displayed text in order', () => {
    const segs = buildSegments(SCRIPTURE, SCRIPTURE_TIMINGS);
    const timed = segs.filter(s => s.start != null);
    expect(timed).toHaveLength(2); // 3rd (reference) is not in the display text → skipped
    expect(timed[0].text).toBe('Do not let your hearts be troubled.');
    expect(timed[1].text).toBe('You believe in God; believe also in me.');
  });

  test('reassembles to exactly the original text (no chars lost or added)', () => {
    const segs = buildSegments(SCRIPTURE, SCRIPTURE_TIMINGS);
    expect(segs.map(s => s.text).join('')).toBe(SCRIPTURE);
  });

  test('tolerates whitespace/newline differences between spoken text and display', () => {
    const display = 'When anxiety settles in,\nit rarely asks permission. You only know.';
    const timings = [
      { text: 'When anxiety settles in, it rarely asks permission.', start: 0, end: 3.6 },
      { text: 'You only know.', start: 4, end: 6 },
    ];
    const segs = buildSegments(display, timings);
    expect(segs.map(s => s.text).join('')).toBe(display);   // original preserved incl. newline
    expect(segs.filter(s => s.start != null)).toHaveLength(2);
  });

  test('no timings → single plain segment', () => {
    expect(buildSegments(SCRIPTURE, null)).toEqual([{ text: SCRIPTURE }]);
    expect(buildSegments(SCRIPTURE, [])).toEqual([{ text: SCRIPTURE }]);
  });

  test('isSegmentActive picks the sentence under the cursor', () => {
    const segs = buildSegments(SCRIPTURE, SCRIPTURE_TIMINGS);
    const timed = segs.filter(s => s.start != null);
    expect(isSegmentActive(timed[0], 1.0)).toBe(true);
    expect(isSegmentActive(timed[0], 5.0)).toBe(false);
    expect(isSegmentActive(timed[1], 5.0)).toBe(true);
    expect(isSegmentActive({ text: 'x' }, 5.0)).toBe(false); // filler never active
  });
});
