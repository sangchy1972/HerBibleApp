import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import LottieView from 'lottie-react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useFeaturedPlans } from '../state/FeaturedPlansContext';
import { usePlanCompletion } from '../state/PlanCompletionContext';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

// Day-completion congrats. Plays a Lottie above the headline, shows progress,
// lets the user share their progress or continue back to the plan detail.
// Two animations (extracted from the user's dotLottie files into plain JSON):
//   • day-done.json      — checkmark; days 1..n-1 of a plan
//   • plan-congrats.json — confetti celebration; the FINAL day (plan complete),
//     paired with "Congratulations! / You completed this plan" copy.
const LOTTIE_DAY_DONE = require('../../assets/lottie/day-done.json');
const LOTTIE_PLAN_CONGRATS = require('../../assets/lottie/plan-congrats.json');

export default function PlanDayDone({ route, navigation }: RootStackScreenProps<'PlanDayDone'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { slug, day } = route.params;
  const { getSummary } = useFeaturedPlans();
  const { planProgress } = usePlanCompletion();
  const summary = getSummary(slug);
  const progress = summary ? planProgress(slug, summary.duration) : { completed: 0, total: 0, complete: false };
  // Final day of the plan → confetti + "Congratulations" copy instead of
  // the per-day checkmark + "Day N of M".
  const planComplete = progress.complete && progress.total > 0;

  // Animated progress fill — sweeps from previous to current ratio over 1 s
  // when the screen mounts so the user sees their bar grow.
  const progressVal = useSharedValue(Math.max(0, progress.completed - 1) / Math.max(1, progress.total));
  useEffect(() => {
    progressVal.value = withTiming(progress.completed / Math.max(1, progress.total), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress.completed, progress.total, progressVal]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${Math.round(progressVal.value * 100)}%` }));

  const onShare = () => {
    if (!summary) return;
    const remaining = Math.max(0, summary.duration - progress.completed);
    const dayWord = remaining === 1 ? t('prayer.streak.day') : t('prayer.streak.days');
    // Two share paths: the "still some days left" line (localized template
    // with placeholders), and the "all done — celebration" line. Both end
    // with the brand mark so the recipient knows where it came from.
    const message = remaining > 0
      ? t('plan.dayDone.shareMessage', { day, title: summary.title, remaining, dayWord })
      : `${t('plan.completed', { title: summary.title })} 🙏`;
    Share.share({ message }).catch(() => {});
  };

  // Lands on this plan's FeaturedPlanDetail (already in the stack underneath
  // the modal: [Tabs, FeaturedPlanDetail, PlanDayDone]). The previous
  // popToTop sent the user back to the Plan tab, which felt like losing
  // their place — they wanted to stay inside the plan they just advanced.
  const onContinue = () => navigation.goBack();

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.closeBtn, { top: insets.top + 12 }]} hitSlop={10}>
        <Feather name="x" size={24} color={TXT} />
      </TouchableOpacity>

      {/* Bottom padding 24 → 44 (+20 px per user — CTAs sat too close to the screen edge). */}
      <View style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 44 }]}>
        {/* Celebration block fills the space above the CTAs and centers
            vertically, so the Lottie + copy sit lower / visually centered
            (per user) instead of hugging the top. */}
        <View style={styles.centerBlock}>
          <Animated.View entering={FadeIn.duration(360)} style={styles.lottieWrap}>
            <LottieView
              source={planComplete ? LOTTIE_PLAN_CONGRATS : LOTTIE_DAY_DONE}
              autoPlay
              // Confetti loops while the user takes in the moment; the
              // day-checkmark plays once like before.
              loop={planComplete}
              // congrats source is a wide 300×180 comp; the checkmark is square.
              style={planComplete ? { width: 280, height: 168 } : { width: 180, height: 180 }}
            />
          </Animated.View>

          <Animated.Text entering={FadeIn.delay(420).duration(360)} style={styles.heading}>
            {planComplete
              ? t('plan.dayDone.congratsTitle')
              : t('plan.row.dayOfTotal', { n: day, total: summary?.duration || '?' })}
          </Animated.Text>

          <Animated.Text entering={FadeIn.delay(560).duration(360)} style={styles.subtitle}>
            {planComplete ? t('plan.dayDone.congratsSubtitle') : summary?.title ?? ''}
          </Animated.Text>

          <Animated.View entering={FadeIn.delay(700).duration(360)} style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressStyle, { backgroundColor: ROSE }]} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(700).duration(360)} style={styles.progressText}>
            {t('plan.daysProgress', { completed: progress.completed, total: progress.total || '?' })}
          </Animated.Text>
        </View>

        <Animated.View entering={FadeIn.delay(900).duration(360)} style={styles.ctaWrap}>
          <TouchableOpacity onPress={onShare} activeOpacity={0.9} style={styles.shareBtn}>
            <Feather name="share-2" size={18} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>{t('plan.dayDone.shareProgress')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={styles.continueBtn}>
            <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  closeBtn: {
    position: 'absolute', right: P, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(30,27,46,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    flex: 1, alignItems: 'center', paddingHorizontal: P,
  },
  // Fills the space above the CTAs and centers its children vertically —
  // shifts the Lottie + copy toward the visual center of the screen.
  centerBlock: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  lottieWrap: { alignItems: 'center', justifyContent: 'center' },
  // All on-screen text uses Noto Sans (matching the rest of the app's
  // sans-serif system font) — the previous Roboto Serif heading felt
  // editorial in a screen that's celebratory / functional.
  heading: {
    fontFamily: FONTS.sansBold, fontSize: 26, fontWeight: '700', color: TXT,
    marginTop: 14, textAlign: 'center', letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    fontSize: 17, color: TXTSUB, marginTop: 6, textAlign: 'center',
    paddingHorizontal: 20,
  },
  progressTrack: {
    width: '80%', height: 8, borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.08)',
    marginTop: 28, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontFamily: FONTS.sansSemiBold, fontSize: 13, color: TXTSUB, marginTop: 10, fontWeight: '600' },
  ctaWrap: { width: '100%', gap: 10 },                                          // marginTop:'auto' dropped — centerBlock's flex:1 now owns the spacing
  // Height + radius mirror PrayerScreen.startBtn ("Start Night Prayer":
  // 46.94 / 17.07) so the plan-done CTAs match the home CTA exactly (per user).
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 46.94, borderRadius: 17.07, backgroundColor: ROSE,
    shadowColor: ROSE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 14, elevation: 4,
  },
  shareBtnText: { fontFamily: FONTS.sansBold, fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },
  continueBtn: {
    height: 46.94, borderRadius: 17.07, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(30,27,46,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  continueBtnText: { fontFamily: FONTS.sansBold, fontSize: 16, fontWeight: '700', color: TXT, letterSpacing: 0.4 },
});
