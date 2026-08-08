import React from 'react';
import { useT } from '../i18n/useT';
import { useFirstRunTour } from '../state/FirstRunTourContext';
import { useStreakGuide } from '../state/StreakGuideContext';
import { usePrayer } from '../state/PrayerContext';
import { streakScenario } from '../state/streakGuide';
import SpotlightCoach from './shared/SpotlightCoach';

// The rookie streak guide's overlay — copy, anchors and CTA routing only; all
// the scrim/bubble machinery lives in shared/SpotlightCoach. Root-mounted so
// it covers the tab bar. Each step is keyed → remounts → fresh close-in.
//
// Step 1 spotlights the home flame pill (reusing the first-run tour's
// registered measurer); step 2 the streak screen's milestone card.

const SHAPE = {
  step1: { pad: 6, radius: 23 },    // the 34px streak chip
  step2: { pad: 8, radius: 28 },    // the full-width r=20 milestone card
} as const;

export default function StreakGuideHost() {
  const guide = useStreakGuide();
  if (guide.stage === 'idle') return null;
  return <StreakStep key={guide.stage} />;
}

function StreakStep() {
  const t = useT();
  const guide = useStreakGuide();
  const tour = useFirstRunTour();
  const { mDone, eDone } = usePrayer();

  const step: 'step1' | 'step2' = guide.stage === 'step2' ? 'step2' : 'step1';
  // The scenario decides the final CTA. Evaluated LIVE at render — if the
  // clock crosses 18:00 between steps, the button upgrades itself from
  // "come back tonight" to "start night prayer".
  const scenario = streakScenario(mDone, eDone, new Date().getHours());

  const primaryLabel = step === 'step1'
    ? t('streakGuide.continue')
    : scenario === 'startNight' ? t('prayer.startNight')
    : scenario === 'startMorning' ? t('prayer.startMorning')
    : scenario === 'nightLater' ? t('streakGuide.btn.tonight')
    : t('streakGuide.btn.done');

  const onPrimary = () => {
    if (step === 'step1') { guide.advanceToStreak(); return; }
    if (scenario === 'startNight' || scenario === 'startMorning') {
      const kind = scenario === 'startNight' ? 'evening' : 'morning';
      guide.dismiss(`start_${kind}`);
      // Mirrors the first-run tour's hand-off: fire the flow as the scrim tail
      // is still fading so the tap feels instant.
      setTimeout(() => guide.startPrayer(kind), 120);
    } else {
      guide.dismiss(scenario === 'nightLater' ? 'come_back_tonight' : 'done');
    }
  };

  return (
    <SpotlightCoach
      focused={step === 'step1' ? guide.homeFocused : guide.streakFocused}
      measure={step === 'step1' ? () => tour.measureAnchor('streak') : guide.measureMilestone}
      pad={SHAPE[step].pad}
      radius={SHAPE[step].radius}
      counter={t('tour.progress', { n: step === 'step1' ? 1 : 2, total: 2 })}
      title={t(step === 'step1' ? 'streakGuide.step1.title' : 'streakGuide.step2.title')}
      body={t(step === 'step1'
        ? (mDone ? 'streakGuide.step1.night' : 'streakGuide.step1.morning')
        : 'streakGuide.step2.body')}
      primaryLabel={primaryLabel}
      skipLabel={t('tour.skip')}
      onPrimary={onPrimary}
      onSkip={() => guide.dismiss('skip')}
      onUnmeasurable={() => guide.dismiss('anchor_unmeasurable')}
    />
  );
}
