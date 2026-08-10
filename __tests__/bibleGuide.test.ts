import {
  BIBLE_GUIDE_STEPS, bibleGuideNext, bibleGuideCounter, bibleGuideInteractive,
  bibleGuideAfterDrawer, bibleGuideEligible, type BibleGuideStep,
} from '../src/state/bibleGuide';

// The Bible-reader guide's rules. The step order is product copy's contract (the
// bubbles name specific controls in a specific order), and the drawer rule is the
// one piece of behaviour that is easy to get subtly wrong: she is invited to tap
// the highlighted control mid-step, so a close has to mean "advance" in exactly
// one stage and "do nothing" in every other.

describe('step order', () => {
  it('is the five steps the copy is written for, in screen order', () => {
    expect(BIBLE_GUIDE_STEPS).toEqual(['tools', 'books', 'audio', 'verse', 'complete']);
  });

  it('walks tools → complete and then stops', () => {
    const walked: BibleGuideStep[] = ['tools'];
    for (;;) {
      const n = bibleGuideNext(walked[walked.length - 1]);
      if (!n) break;
      walked.push(n);
      if (walked.length > 10) throw new Error('bibleGuideNext does not terminate');
    }
    expect(walked).toEqual([...BIBLE_GUIDE_STEPS]);
    expect(bibleGuideNext('complete')).toBeNull();
  });

  it('counts 1..5 of 5', () => {
    expect(BIBLE_GUIDE_STEPS.map(s => bibleGuideCounter(s)))
      .toEqual([1, 2, 3, 4, 5].map(n => ({ n, total: 5 })));
  });
});

describe('which step exposes its anchor to real touches', () => {
  it('is only the books step — she is invited to open the drawer there', () => {
    expect(bibleGuideInteractive('books')).toBe(true);
  });

  it('is no other step', () => {
    // Deliberate: step 5's anchor MARKS THE CHAPTER READ. A tappable hole there
    // would let a tour teaching the button also press it for her.
    for (const s of BIBLE_GUIDE_STEPS) {
      if (s !== 'books') expect(bibleGuideInteractive(s)).toBe(false);
    }
  });
});

describe('the drawer closing', () => {
  it('advances past the books step — she just used the control it teaches', () => {
    expect(bibleGuideAfterDrawer('books')).toBe('audio');
  });

  it('leaves every other stage alone', () => {
    // The audio player has its own "queue" button that opens the same drawer, and
    // she may open it before the tour ever starts. Neither may move the stage.
    expect(bibleGuideAfterDrawer('idle')).toBeNull();
    for (const s of BIBLE_GUIDE_STEPS) {
      if (s !== 'books') expect(bibleGuideAfterDrawer(s)).toBeNull();
    }
  });

  it('never returns the step it was called for, which would re-teach it', () => {
    expect(bibleGuideAfterDrawer('books')).not.toBe('books');
  });
});

describe('eligibility', () => {
  it('runs once ever — a done flag ends it whatever else is true', () => {
    expect(bibleGuideEligible(true, true)).toBe(false);
    expect(bibleGuideEligible(true, false)).toBe(false);
  });

  it('waits for the chapter: four of five anchors do not exist without verses', () => {
    expect(bibleGuideEligible(false, false)).toBe(false);
  });

  it('starts on a first visit with a loaded chapter', () => {
    expect(bibleGuideEligible(false, true)).toBe(true);
  });

  it('has NO day or engagement gate — day 30 is as valid as day 0', () => {
    // The owner was explicit: a woman who finds the reader on day 3 needs the
    // tour more, not less. There is deliberately no third argument to add one to.
    expect(bibleGuideEligible.length).toBe(2);
  });
});
