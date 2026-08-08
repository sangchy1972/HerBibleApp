import React from 'react';
import { useT } from '../i18n/useT';
import { usePlanGuide } from '../state/PlanGuideContext';
import { planGuideCounter, type PlanGuideStep } from '../state/planGuide';
import SpotlightCoach from './shared/SpotlightCoach';

// The plan-discovery guide's overlay — copy, anchors and routing only; the
// scrim/bubble machinery is shared/SpotlightCoach. Root-mounted so the 'tab'
// step can spotlight the tab bar itself.

const SHAPE: Record<PlanGuideStep, { pad: number; radius: number }> = {
  tab:     { pad: 4, radius: 20 },   // one tab item (icon + label)
  explore: { pad: 5, radius: 24 },   // the Explore pill in the segmented row
  mood:    { pad: 8, radius: 22 },   // the how-are-you-feeling section
};

export default function PlanGuideHost() {
  const guide = usePlanGuide();
  if (guide.stage === 'idle') return null;
  return <PlanStep key={guide.stage} />;
}

function PlanStep() {
  const t = useT();
  const guide = usePlanGuide();
  const step = guide.stage as PlanGuideStep;

  const { n, total } = planGuideCounter(guide.entry, step);
  const measure = step === 'tab' ? guide.measurePlanTab
    : step === 'explore' ? guide.measureExplore
    : guide.measureMood;

  return (
    <SpotlightCoach
      focused={step === 'tab' ? guide.homeFocused : guide.planFocused}
      measure={measure}
      pad={SHAPE[step].pad}
      radius={SHAPE[step].radius}
      counter={t('tour.progress', { n, total })}
      title={t(`planGuide.${step}.title`)}
      body={t(`planGuide.${step}.body`)}
      primaryLabel={step === 'tab' ? t('streakGuide.continue')
        : step === 'explore' ? t('tour.next')
        : t('planGuide.start')}
      skipLabel={t('tour.skip')}
      onPrimary={guide.next}
      onSkip={() => guide.dismiss('skip')}
      onUnmeasurable={() => guide.dismiss('anchor_unmeasurable')}
    />
  );
}
