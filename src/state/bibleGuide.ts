// The Bible-reader guide's decision rules — pure, zero-import, unit-tested.
//
// Fires on her FIRST EVER visit to the Bible tab, whenever that happens: day 0
// or day 30. It is not a launch tour and deliberately has no day/engagement
// gate — the moment worth teaching is the moment she first opens a chapter,
// and a woman who finds the reader on day 3 needs the tour more than one who
// found it on day 0, not less (owner 2026-08-09).
//
// Five steps, in the order the screen reads:
//   tools    the three icons top-RIGHT — search, bookmark, text size
//   books    the menu button top-LEFT. Its hole is TAPPABLE: she may open the
//            drawer and switch books mid-step. That is not an interruption to
//            recover from, it is the step succeeding — see bibleGuideAfterDrawer.
//   audio    the floating narration button
//   verse    a real verse toolbar, opened for her on verse 1
//   complete the Mark-as-Complete CTA, after scrolling her to it
//
// ONCE EVER: the done flag burns on display, so a crash or a force-quit mid-tour
// cannot loop it on every later visit.

export type BibleGuideStep = 'tools' | 'books' | 'audio' | 'verse' | 'complete';

export const BIBLE_GUIDE_STEPS: readonly BibleGuideStep[] =
  ['tools', 'books', 'audio', 'verse', 'complete'] as const;

/** The step after `step`, or null when the tour is finished. */
export function bibleGuideNext(step: BibleGuideStep): BibleGuideStep | null {
  const i = BIBLE_GUIDE_STEPS.indexOf(step);
  if (i < 0 || i >= BIBLE_GUIDE_STEPS.length - 1) return null;
  return BIBLE_GUIDE_STEPS[i + 1];
}

/** 1-based position + total for the bubble's "n of total" counter. */
export function bibleGuideCounter(step: BibleGuideStep): { n: number; total: number } {
  return {
    n: Math.max(1, BIBLE_GUIDE_STEPS.indexOf(step) + 1),
    total: BIBLE_GUIDE_STEPS.length,
  };
}

/** Only the 'books' step exposes its anchor to real touches. */
export function bibleGuideInteractive(step: BibleGuideStep): boolean {
  return step === 'books';
}

/**
 * Where to go when the book drawer closes.
 *
 * She took the invitation and opened the drawer during 'books' — maybe switched
 * books, maybe just looked. Either way she has now DONE the thing that step was
 * teaching, so the tour resumes at the next step rather than re-explaining a
 * button she just used. Any other stage means the drawer had nothing to do with
 * the tour (she opened it before it started, or during a later step via the
 * audio player's queue button) and the stage must not move.
 */
export function bibleGuideAfterDrawer(stage: BibleGuideStep | 'idle'): BibleGuideStep | 'idle' | null {
  if (stage !== 'books') return null;          // null = leave the stage alone
  return bibleGuideNext('books') ?? 'idle';
}

/** May the guide start when the Bible tab gains focus? */
export function bibleGuideEligible(done: boolean, chapterReady: boolean): boolean {
  // chapterReady matters: every anchor except the header lives in or below the
  // verse list, and starting against an empty screen would spotlight a spinner
  // and then bail out through onUnmeasurable, burning the once-ever flag on a
  // tour she never saw.
  return !done && chapterReady;
}
