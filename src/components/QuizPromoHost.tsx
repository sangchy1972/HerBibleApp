import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useQuiz } from '../state/QuizContext';
import { useQuizPromo } from '../state/QuizPromoContext';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import { mysteryView, MYSTERY_EVERY } from '../state/quizProgress';
import { useT } from '../i18n/useT';
import { logEvent } from '../services/firebase';
import { ROSE, TXT, TXTSUB, FONTS } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

// "Finish a quiz set, earn a reward card" — feature discovery for the quiz.
//
// WHEN. Only in the afternoon gap: everything else for today is done and it is
// not yet 18:00, so evening prayer has not opened. `rhythm.state.kind ===
// 'waitEvening'` is the codebase's own name for exactly that state, and using
// it rather than counting hours means this stays correct if the rhythm ever
// gains a step. Plus `hour >= 12`, which keeps it away from the morning open —
// that is where the reminder ask, the login prompt and the mood ritual all
// cluster, and the coordinator only allows two blocking prompts per open.
//
// MOUNTED ON THE HOME SCREEN, not in App.tsx, following RatePromptHost. A promo
// for a feature reached from the home screen has no business registering itself
// while she is deep in a prayer flow.
//
// BUDGETED, priority 65. It yields to the badge unlock, the reminder ask, the
// mood ritual, the login prompt and the widget ask; it outranks only the rate
// prompt. See nudgePriority.ts.
//
// THE PROGRESS IS REAL. The card shows how many sets stand between her and her
// next mystery card, read from the same `mysteryView` the results screen uses.
// A promo that invented a number would be caught out the moment she tapped
// through, and this is the one screen where the number is the whole argument.

export default function QuizPromoHost({ inGap }: {
  /** True only in the afternoon lull — see the header. The home screen owns
   *  this because it already computes the rhythm; recomputing it here would be
   *  a second source of truth for "what is she doing today". */
  inGap: boolean;
}) {
  const t = useT();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { ready, bank, progress, lifecycle, daily, canStart } = useQuiz();
  const promo = useQuizPromo();
  const coord = useNudgeCoordinator();

  // She has already met the feature. Terminal, and checked before anything else
  // so a returning player never sees an introduction to something she plays.
  const played = progress.completedSets > 0;
  useEffect(() => { if (played) promo.markConverted(); }, [played]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Every condition that must hold for the prompt to be honest:
  //   ready + bank   — the quiz genuinely exists on this device
  //   !retired       — there is still something to play
  //   canStart       — today's allowance is not already spent, so the CTA works
  //   !played        — she has not met it already
  const eligible = inGap
    && ready && !!bank && !lifecycle.retired && canStart && !played
    && promo.ready && promo.shouldShow();

  useEffect(() => {
    if (eligible) coord.requestSlot({ id: 'quizPromo', priority: NUDGE_PRIORITY.quizPromo, canShow: () => true });
    else coord.releaseSlot('quizPromo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  const active = coord.isActive('quizPromo');

  // The cadence advances the moment it APPEARS, not when she answers it.
  // Marking on dismiss would let a prompt she swipes past reappear on the next
  // open, which is the failure mode the escalating gap exists to prevent.
  const markedRef = useRef(false);
  useEffect(() => {
    if (active && !markedRef.current) {
      markedRef.current = true;
      promo.markShown();
      logEvent('quiz_promo_shown', { completed_sets: progress.completedSets });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const dismiss = () => { coord.notifyDismissed('quizPromo'); coord.releaseSlot('quizPromo'); };
  const onTake = () => {
    logEvent('quiz_promo_tap', { completed_sets: progress.completedSets });
    dismiss();
    // The same 60 ms the widget nudge uses: navigating in the same tick as the
    // dismiss races the overlay's exit and the push can be swallowed.
    setTimeout(() => { try { nav.navigate('Quiz'); } catch { /* route may not be mounted */ } }, 60);
  };

  const mystery = mysteryView(progress.completedSets);
  // "N sets to your next card". For a first-timer that is the full 3, which is
  // also the daily allowance — so the honest promise is "one afternoon".
  const setsToCard = Math.min(mystery.remaining, daily.remaining);

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      <Animated.View entering={FadeIn.duration(200)} style={styles.card}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="cards-outline" size={26} color={ROSE} />
        </View>
        <Text style={styles.title}>{t('nudge.quiz.title')}</Text>
        <Text style={styles.body}>{t('nudge.quiz.body')}</Text>

        {/* Read from the same mysteryView the results screen uses. If this ever
            disagreed with what she sees after tapping through, the prompt would
            have lied to her at the only moment it had her attention. */}
        <View style={styles.progressRow}>
          {Array.from({ length: MYSTERY_EVERY }, (_, i) => (
            <View key={i} style={[styles.pip, i < mystery.current && styles.pipOn]} />
          ))}
        </View>
        <Text style={styles.progressText}>
          {t('nudge.quiz.progress', { n: Math.max(1, setsToCard) })}
        </Text>

        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onTake}>
          <Text style={styles.ctaText}>{t('nudge.quiz.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>{t('nudge.quiz.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// Deliberately the same card as WidgetInstallHost and SetReminderTimeHost:
// centred white card, rose-wash icon disc, filled rose CTA, quiet "not now".
// That treatment is this app's nudge language — a bottom sheet would read as a
// ritual and a full-screen modal as a reward, and this is neither.
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: 'rgba(20,12,24,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${ROSE}16`, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', fontFamily: FONTS.loraBold, color: TXT, textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4, marginBottom: 16 },
  progressRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  pip: { width: 26, height: 6, borderRadius: 3, backgroundColor: `${ROSE}24` },
  pipOn: { backgroundColor: ROSE },
  progressText: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.3, marginBottom: 18 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '700', letterSpacing: 0.3 },
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
