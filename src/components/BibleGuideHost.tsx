import React from 'react';
import { useT } from '../i18n/useT';
import { useBibleGuide } from '../state/BibleGuideContext';
import { bibleGuideCounter, bibleGuideInteractive, type BibleGuideStep } from '../state/bibleGuide';
import SpotlightCoach from './shared/SpotlightCoach';

// The Bible-reader guide's overlay — copy, anchors and routing only; the
// scrim/bubble machinery is shared/SpotlightCoach.
//
// Root-mounted (not inside BibleScreen) so the scrim covers the bottom tab bar
// too. A guide that dims the chapter but leaves the tabs bright reads as a
// half-finished overlay, and step 3's anchor sits close enough to the tab bar
// that the undimmed strip would compete with it.

const SHAPE: Record<BibleGuideStep, { pad: number; radius: number }> = {
  tools:    { pad: 6, radius: 18 },   // the three header icons as one group
  books:    { pad: 8, radius: 20 },   // one 32pt header button — needs the room
  audio:    { pad: 7, radius: 34 },   // a circular FAB
  verse:    { pad: 8, radius: 22 },   // the full verse toolbar card
  complete: { pad: 6, radius: 20 },   // the rose CTA, BTN_RADIUS-ish
};

export default function BibleGuideHost() {
  const guide = useBibleGuide();
  if (guide.stage === 'idle') return null;
  // The book drawer (zIndex 120, inside the screen) and this overlay (app root)
  // are in different parents, so it paints UNDER us however the z-order reads.
  // Hide while it is up: she opened it on our invitation and needs to actually
  // use it. The step is preserved — the stage never changed.
  if (guide.drawerOpen) return null;
  return <BibleStep key={guide.stage} />;
}

function BibleStep() {
  const t = useT();
  const guide = useBibleGuide();
  const step = guide.stage as BibleGuideStep;

  const { n, total } = bibleGuideCounter(step);
  // Bound to the STABLE measureFor, not to `guide` — the context value changes
  // identity on every stage/drawer flip, and a fresh `measure` each time would
  // re-trigger the overlay's measure effect for no reason.
  const measureFor = guide.measureFor;
  const measure = React.useCallback(() => measureFor(step), [measureFor, step]);

  return (
    <SpotlightCoach
      focused={guide.bibleFocused}
      measure={measure}
      pad={SHAPE[step].pad}
      radius={SHAPE[step].radius}
      interactiveHole={bibleGuideInteractive(step)}
      counter={t('tour.progress', { n, total })}
      title={t(`bibleGuide.${step}.title`)}
      body={t(`bibleGuide.${step}.body`)}
      primaryLabel={step === 'complete' ? t('bibleGuide.start') : t('tour.next')}
      skipLabel={t('tour.skip')}
      onPrimary={guide.next}
      onSkip={() => guide.dismiss('skip')}
      onUnmeasurable={() => guide.dismiss('anchor_unmeasurable')}
    />
  );
}
