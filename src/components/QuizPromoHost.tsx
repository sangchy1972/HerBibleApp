import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  Easing, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
// WHEN. Only in the afternoon gap: morning prayer done, evening not yet open
// (`mDone && !eDone && hour ∈ [12,18)` — computed by the home screen since the
// rhythm bar's removal 2026-08-22; slightly WIDER than the old `waitEvening`,
// which also required the readings done — this host's own cadence/coordinator
// gates still bound it). The `hour >= 12` half keeps it away from the morning open —
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
   *  this because it owns mDone/eDone; recomputing here would be a second
   *  source of truth for "what is she doing today". */
  inGap: boolean;
}) {
  const t = useT();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const { ready, bank, progress, lifecycle, daily, canStart, totalSets } = useQuiz();
  const promo = useQuizPromo();
  const coord = useNudgeCoordinator();

  // She has already met the feature. Terminal, and checked before anything else
  // so a returning player never sees an introduction to something she plays.
  const played = progress.completedSets > 0;
  // `promo.ready` is load-bearing: without it this can fire while the provider's
  // getItem is still in flight, and persist() would spread over the
  // pre-hydration DEFAULT — writing converted:true on top of zeroed counters and
  // then having the resolving read flip it back to false in memory.
  useEffect(() => {
    if (promo.ready && played) promo.markConverted();
  }, [promo.ready, played]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Every condition that must hold for the prompt to be honest:
  //   ready + bank   — the quiz genuinely exists on this device
  //   !retired       — there is still something to play
  //   canStart       — today's allowance is not already spent, so the CTA works
  //   !played        — she has not met it already
  const eligible = inGap
    && ready && !!bank && !lifecycle.retired && canStart && !played
    && promo.ready && promo.shouldShow();
  // Read through a ref inside canShow. `eligible` contains the cadence, and
  // markShown() below flips the cadence false the instant the slot is granted —
  // so a naive `else releaseSlot()` tears the card down inside its own 200 ms
  // fade-in. Nobody sees it, and it still spends the budget. RatePromptHost
  // solved this first; this is the same shape.
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const active = coord.isActive('quizPromo');

  // `isFocused`: PrayerScreen stays MOUNTED behind every tab and every pushed
  // screen (no unmountOnBlur anywhere), so without this the promo can arm while
  // she is in the Bible, in a plan, or already in the quiz — and render inside a
  // hidden screen. The showing is burned and the card is never seen.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (active) return;                       // never disturb a live prompt
    if (isFocused && eligible) {
      coord.requestSlot({ id: 'quizPromo', priority: NUDGE_PRIORITY.quizPromo, canShow: () => eligibleRef.current });
    } else {
      coord.releaseSlot('quizPromo');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, eligible, active]);

  // Release on unmount. Unreachable today, but a slot left active wedges the
  // coordinator's `if (activeId !== null) return` for every other prompt,
  // including badge unlocks.
  // `coord.releaseSlot`, NOT `coord`. The context value is memoized on
  // `activeId` (NudgeCoordinatorContext), so `coord`'s identity changes on the
  // very transition that GRANTS this host its slot — and an effect keyed on
  // `[coord]` then runs its cleanup one frame later and releases it. That is the
  // self-cancel this whole file was rewritten to remove, reintroduced by the
  // cleanup that was supposed to be the safe part. releaseSlot is a stable
  // useCallback, so capturing the function pins the dependency.
  const release = coord.releaseSlot;
  useEffect(() => () => release('quizPromo'), [release]);

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
    if (!active) markedRef.current = false;   // a later, legitimate showing must still count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // SHARED VALUE, never `entering=`. This card lives inside an RN <Modal>, and
  // Reanimated LAYOUT animations do not reliably run there on the new
  // architecture (CommentsSheet and PrayerFlow both hit it) — a dropped entrance
  // leaves the card at opacity 0 inside a TRANSPARENT full-screen native window:
  // a dim wash with an invisible CTA that swallows every touch in the app. The
  // watchdog snaps it visible if the timing is dropped.
  const cardO = useSharedValue(0);
  useEffect(() => {
    cardO.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
    const wd = setTimeout(() => { cardO.value = 1; }, 900);
    return () => clearTimeout(wd);
  }, [cardO]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardO.value }));

  if (!active) return null;

  const dismiss = () => { coord.notifyDismissed('quizPromo'); coord.releaseSlot('quizPromo'); };
  const onTake = () => {
    logEvent('quiz_promo_tap', { completed_sets: progress.completedSets });
    dismiss();
    // The same 60 ms the widget nudge uses: navigating in the same tick as the
    // dismiss races the overlay's exit and the push can be swallowed.
    setTimeout(() => { try { nav.navigate('Quiz'); } catch { /* route may not be mounted */ } }, 60);
  };

  const mystery = mysteryView(progress.completedSets, totalSets);
  // "N sets to your next card". For a first-timer that is the full 3, which is
  // also the daily allowance — so the honest promise is "one afternoon".
  const setsToCard = Math.min(mystery.remaining, daily.remaining);

  return (
    // A Modal, not a bare overlay. This host is mounted inside PrayerScreen, so
    // an absoluteFill View is bounded by the tab SCREEN — the scrim stopped
    // above the tab bar, the card centred in the wrong box, and she could tap
    // straight past a supposedly blocking prompt by hitting another tab.
    // RatePromptSheet is a Modal for the same reason; the two App-root nudges
    // get away with a plain View only because they are mounted at the root.
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={dismiss}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="cards-outline" size={26} color={ROSE} />
        </View>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>{t('nudge.quiz.title')}</Text>
        {/* Scrolls rather than clips. This is the longest body of any nudge in
            the app, German is the longest locale, and at a Larger-Text setting
            of 1.3 the card already reaches the bottom of an iPhone SE. */}
        <ScrollView style={styles.bodyWrap} contentContainerStyle={styles.bodyBox} showsVerticalScrollIndicator={false}>
          <Text style={styles.body} maxFontSizeMultiplier={1.3}>{t('nudge.quiz.body')}</Text>
        </ScrollView>

        {/* Read from the same mysteryView the results screen uses. If this ever
            disagreed with what she sees after tapping through, the prompt would
            have lied to her at the only moment it had her attention. */}
        <View style={styles.progressRow}>
          {Array.from({ length: MYSTERY_EVERY }, (_, i) => (
            <View key={i} style={[styles.pip, i < mystery.current && styles.pipOn]} />
          ))}
        </View>
        <Text style={styles.progressText} maxFontSizeMultiplier={1.3}>
          {t('nudge.quiz.progress', { n: Math.max(1, setsToCard) })}
        </Text>

        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={onTake}>
          <Text style={styles.ctaText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t('nudge.quiz.cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t('nudge.quiz.later')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
    </Modal>
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
  bodyWrap: { flexGrow: 0, alignSelf: 'stretch', maxHeight: 168, marginBottom: 16 },
  bodyBox: { flexGrow: 1, justifyContent: 'center' },
  body: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, textAlign: 'center', fontFamily: FONTS.lato, letterSpacing: 0.4 },
  progressRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  pip: { width: 26, height: 6, borderRadius: 3, backgroundColor: `${ROSE}24` },
  pipOn: { backgroundColor: ROSE },
  progressText: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.3, marginBottom: 18 },
  cta: { alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 17.5, fontWeight: '700', letterSpacing: 0.3 },   // CTA size unified at 17.5 (was 16.5) — per user
  later: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: TXTSUB, fontSize: 15, fontWeight: '600' },
});
