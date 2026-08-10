import { entranceMustSettle, type EntranceFrame } from '../src/components/shared/entranceSettle';

// The rule that decides when a tab section hands its subtree back to plain RN.
// Getting it wrong does not look like a bug in an animation — it looks like the
// home screen's cards silently eating taps, which is the single most-reported
// defect in this app. The sequences below are the ones that matter.

/** Feed frames through the tracker the way useTabFocusEntrance does. */
function track(frames: EntranceFrame[], opts: { clearBaselineAt?: number } = {}) {
  let baseline: EntranceFrame | null = null;
  const settled: number[] = [];
  frames.forEach((f, i) => {
    // `clearBaselineAt` simulates the OLD re-arm, which nulled the baseline on
    // every focus. Kept in the test so the regression is demonstrated, not just
    // described.
    if (opts.clearBaselineAt === i) baseline = null;
    if (entranceMustSettle(baseline, f)) settled.push(i);
    baseline = f;
  });
  return settled;
}

describe('entranceMustSettle', () => {
  it('never settles on the first layout of a lifetime — that is the baseline', () => {
    expect(entranceMustSettle(null, { y: 100, h: 400 })).toBe(false);
  });

  it('does not settle when nothing moved', () => {
    expect(entranceMustSettle({ y: 100, h: 400 }, { y: 100, h: 400 })).toBe(false);
  });

  it('settles when a sibling ABOVE grew (y shifted)', () => {
    expect(entranceMustSettle({ y: 100, h: 400 }, { y: 350, h: 400 })).toBe(true);
  });

  it('settles when content INSIDE hydrated (height changed)', () => {
    // My Reading Plans rendering its rows once the plan summaries land. The
    // y-only version of this check left the card's lower rows — suggested plans,
    // More Plans — untappable for the whole entrance window on every focus.
    expect(entranceMustSettle({ y: 100, h: 120 }, { y: 100, h: 520 })).toBe(true);
  });

  it('ignores sub-pixel jitter in either dimension', () => {
    expect(entranceMustSettle({ y: 100, h: 400 }, { y: 100.4, h: 399.6 })).toBe(false);
  });

  it('settles on a shrink, not just growth', () => {
    expect(entranceMustSettle({ y: 350, h: 400 }, { y: 100, h: 400 })).toBe(true);
  });
});

describe('across a focus cycle — the actual regression', () => {
  // Mount, settle, tab away, come back, and THEN the async content shifts the
  // card down. This is the everyday path: she taps a plan, reads, comes back.
  const frames: EntranceFrame[] = [
    { y: 900, h: 520 },   // 0 mount layout (baseline)
    { y: 900, h: 520 },   // 1 no-op pass
    { y: 1150, h: 520 },  // 2 RE-FOCUS: the rhythm bar / Gospel cards rehydrate above
  ];

  it('catches the shift on a later focus and detaches', () => {
    expect(track(frames)).toEqual([2]);
  });

  it('MISSES it if the baseline is cleared on re-focus — the bug that shipped', () => {
    // The old re-arm did `lastFrame.current = null`, so frame 2 was consumed as
    // a fresh baseline and returned false. No further layout pass follows, so
    // nothing ever detached the view: drawn 250 px lower, tappable only where it
    // used to be, for the rest of the entrance.
    expect(track(frames, { clearBaselineAt: 2 })).toEqual([]);
  });
});
