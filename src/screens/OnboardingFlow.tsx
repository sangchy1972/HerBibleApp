import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, ActivityIndicator, Linking, Dimensions, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import LottieView from 'lottie-react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeInDown, FadeIn, FadeInUp, FadeInRight,
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withRepeat, withSequence, runOnJS, Easing,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ROSE, LAV, TXT, TXTSUB, BG, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useOnboarding, type OnboardingAnswers } from '../state/OnboardingContext';
import { useNotifications } from '../state/NotificationsContext';
import { useUILanguage, UI_LANGUAGES } from '../state/UILanguageContext';
import { logEvent, setUserProps } from '../services/firebase';
import TimePickerSheet from '../components/TimePickerSheet';
import SignInSheet from '../components/SignInSheet';
import { maybeShowOnboardingInterstitial } from '../services/ads';
import { initIap, fetchPrices, purchasePlan, restorePurchases, type PlanId } from '../services/iap';

// New-user onboarding (first launch only — gated in RootNavigator). Flow v2:
// welcome + language picker → short intro interstitial → questionnaire →
// notification soft pre-prompt → login. Single-select questions auto-advance
// on tap; topics is multi-select. Answers persist via OnboardingContext and
// tailor later content. The mood check-in is gated on onboarding.done
// (MoodCheckInContext), so it only ever asks AFTER the user lands in the app.

const TOTAL = 12;

// Analytics step names (snake_case, index-aligned). `step_name` is the
// canonical funnel key for BigQuery — indexes shifted in flow v2 (language +
// intro prepended) and again in v3 (paywall inserted after remind), so events
// carry flow_version. Never renumber names; future steps get NEW names.
const STEP_NAMES = ['language', 'intro', 'goal', 'age', 'bible', 'encourage', 'topics', 'time', 'remind', 'paywall', 'notify', 'login'] as const;
const FLOW_VERSION = 3;

// Onboarding paywall plans — product ids/labels shared with RemoveAdsScreen.
// `save` renders the amber "Save N%" badge (annual vs 12× monthly); lifetime
// carries the rose "Best Value" badge instead.
const PAY_PLANS: ReadonlyArray<{ id: PlanId; labelKey: string; save?: number; best?: boolean }> = [
  { id: 'lifetime', labelKey: 'paywall.plan.lifetime', best: true },
  { id: 'annual',   labelKey: 'paywall.plan.annual',   save: 58 },
  { id: 'monthly',  labelKey: 'paywall.plan.monthly' },
];
// Static fallbacks until (or if) the store answers with localized prices.
const OB_FALLBACK_PRICES: Record<PlanId, string> = { lifetime: 'NT$670', annual: 'NT$420', monthly: 'NT$84' };

const TRIAL_SHEET_H = Math.round(Dimensions.get('window').height * 0.56);
const GIFT_BOX = require('../../assets/paywall/gift-box.png');
const HERO_IMG = require('../../assets/onboarding-hero.webp');
// Full-screen celebration behind the intro step. This is the SAME animation as
// the user's "Free Flex Confetti" dotLottie (byte-identical once extracted), so
// we reuse the asset already in the bundle instead of adding a duplicate.
const LOTTIE_CONFETTI = require('../../assets/lottie/confetti.json');

// Press feedback: every primary CTA scales down on press-in and springs back
// on release, so taps always FEEL acknowledged (per user).
function PressBounce({ onPress, style, children, disabled }: {
  onPress: () => void; style?: object | object[]; children: React.ReactNode; disabled?: boolean;
}) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={anim}>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={disabled}
        onPressIn={() => { s.value = withTiming(0.93, { duration: 90 }); }}
        onPressOut={() => { s.value = withSpring(1, { damping: 11, stiffness: 240 }); }}
        onPress={onPress}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Trial-sheet CTA: continuously pulses (scale 1 ⇄ 1.05) to draw the eye, and
// still gives the press-in/out feedback on top.
function PulseCta({ onPress, style, children, disabled }: {
  onPress: () => void; style?: object | object[]; children: React.ReactNode; disabled?: boolean;
}) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(
      withTiming(1.05, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
    ), -1);
  }, [s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={anim}>
      <TouchableOpacity activeOpacity={0.9} disabled={disabled} onPress={onPress} style={style}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

const GOAL_OPTS = [
  { k: 'closer',     icon: 'heart-outline' },
  { k: 'peace',      icon: 'water-outline' },
  { k: 'habit',      icon: 'flame-outline' },
  { k: 'understand', icon: 'book-outline' },
  { k: 'hope',       icon: 'sunny-outline' },
] as const;

const AGE_OPTS = ['18-24', '25-34', '35-49', '50-64', '65+'] as const;

const BIBLE_OPTS = [
  { k: 'new',      sub: true },
  { k: 'basics',   sub: true },
  { k: 'familiar', sub: true },
  { k: 'regular',  sub: true },
] as const;

const TOPIC_OPTS = ['anxiety', 'hope', 'gratitude', 'family', 'strength', 'faith', 'sleep'] as const;

const TIME_OPTS = [5, 10, 15, 30] as const;

function to12h(h: number, m: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { saveAnswers } = useOnboarding();
  const { settings, setSchedule, requestPermissionAndEnableDefaults } = useNotifications();
  const { lang, setLang } = useUILanguage();

  const [step, setStep] = useState(0);
  const stepName = STEP_NAMES[step];
  const [a, setA] = useState<OnboardingAnswers>({ topics: [] });
  const [editing, setEditing] = useState<'morning' | 'night' | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const notifsOnRef = useRef(false);   // set at the notify step; read by finishAll
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);   // pending single-select auto-advance
  // Language detected (or previously persisted) at mount — used to log whether
  // the user kept the default or actively switched on the welcome step.
  const initialLangRef = useRef(lang);

  // Analytics. `onboarding_start` once (app_language here = the DETECTED
  // language, pre-choice; the chosen one arrives via the `language` answer);
  // `onboarding_step_view` on every step → per-screen funnel in BigQuery.
  useEffect(() => { logEvent('onboarding_start', { app_language: lang, flow_version: FLOW_VERSION }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logEvent('onboarding_step_view', { step_index: step, step_name: STEP_NAMES[step], flow_version: FLOW_VERSION }); }, [step]);
  // The final login screen is itself a login prompt — log it + record the source
  // so a sign-in here is attributed to onboarding in AuthContext's sign_up event.
  useEffect(() => {
    if (stepName === 'login') {
      AsyncStorage.setItem('loginPrompt:lastTrigger', 'onboarding').catch(() => {});
      logEvent('login_prompt_shown', { trigger: 'onboarding' });
    }
  }, [stepName]);

  const goNext = () => {
    const next = Math.min(TOTAL - 1, step + 1);
    setStep(next);
    // Dedicated first-open interstitial: MUST show once before onboarding
    // completes (per user). First attempt fires when leaving the welcome
    // screen; if the unit hasn't filled yet we retry on every later
    // transition — except INTO the paywall, so an ad never stomps the pitch.
    // maybeShowOnboardingInterstitial latches after one success, and nothing
    // calls it after onboarding, so it can never fire twice or late.
    if (STEP_NAMES[next] !== 'paywall') {
      try { maybeShowOnboardingInterstitial(); } catch { /* never block the flow */ }
    }
  };
  const goBack = () => {
    // A pending auto-advance must not fire after the user backs out.
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    setStep((s) => Math.max(0, s - 1));
  };

  // ── Onboarding paywall (step 'paywall') ───────────────────────────────────
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('lifetime');
  const [obPrices, setObPrices] = useState<Record<PlanId, string>>(OB_FALLBACK_PRICES);
  const [payBusy, setPayBusy] = useState(false);
  const [showTrialSheet, setShowTrialSheet] = useState(false);
  useEffect(() => {
    if (stepName !== 'paywall') return;
    (async () => {
      try {
        await initIap();
        const p = await fetchPrices();
        setObPrices(prev => ({ ...prev, ...p }));
      } catch { /* fallback prices stand */ }
    })();
  }, [stepName]);
  const buyPlan = async (plan: PlanId) => {
    if (payBusy) return;
    setPayBusy(true);
    logEvent('onboarding_paywall_buy_tap', { plan, flow_version: FLOW_VERSION });
    try {
      const r = await purchasePlan(plan);
      if (r === 'purchased' || r === 'pending') {
        setShowTrialSheet(false);
        goNext();
      }
    } finally { setPayBusy(false); }
  };
  const onRestore = async () => {
    if (payBusy) return;
    setPayBusy(true);
    try { if (await restorePurchases()) { setShowTrialSheet(false); goNext(); } }
    finally { setPayBusy(false); }
  };
  // Declining the trial sheet (X / backdrop / swipe-down) continues onboarding.
  const declineTrial = () => { setShowTrialSheet(false); goNext(); };
  // Trial-sheet swipe-down dismiss (project rule: every bottom sheet).
  const trialDragY = useSharedValue(TRIAL_SHEET_H);
  useEffect(() => {
    if (showTrialSheet) {
      trialDragY.value = TRIAL_SHEET_H;
      trialDragY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    } else {
      trialDragY.value = TRIAL_SHEET_H;
    }
  }, [showTrialSheet, trialDragY]);
  const trialPan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) trialDragY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        trialDragY.value = withTiming(TRIAL_SHEET_H, { duration: 240 }, (f) => { if (f) runOnJS(declineTrial)(); });
      } else {
        trialDragY.value = withTiming(0, { duration: 220 });
      }
    });
  const trialSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: trialDragY.value }] }));

  // Single-select: store + log the answer, hold the highlight 0.5s so the
  // user SEES what she picked, then auto-advance. Tapping another option
  // during the hold switches the answer and restarts the hold — the pending
  // timer is cancelled so the flow can never double-advance.
  useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current); }, []);
  const pickSingle = (field: keyof OnboardingAnswers, value: string | number) => {
    setA((prev) => ({ ...prev, [field]: value }));
    logEvent('onboarding_answer', { step_name: STEP_NAMES[step], question: String(field), value: String(value) });
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => { advanceTimerRef.current = null; goNext(); }, 500);
  };
  const toggleTopic = (k: string) => {
    setA((prev) => {
      const cur = prev.topics ?? [];
      return { ...prev, topics: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
    });
  };

  // Continue button (steps that aren't single-select auto-advance): log the
  // step's answer as the user moves forward, then advance.
  const continueFrom = () => {
    if (stepName === 'language') {
      logEvent('onboarding_answer', {
        step_name: 'language',
        value: lang,
        was_default: lang === initialLangRef.current ? 'true' : 'false',
      });
    } else if (stepName === 'topics') {
      const topics = a.topics ?? [];
      logEvent('onboarding_answer', { step_name: 'topics', value: topics.join(','), value_count: topics.length });
    } else if (stepName === 'remind') {
      logEvent('onboarding_answer', {
        step_name: 'remind',
        value: `${to12h(settings.morning.hour, settings.morning.minute)}|${to12h(settings.night.hour, settings.night.minute)}`,
      });
    }
    goNext();
  };

  // Notify step: fire the OS permission prompt + enable reminders, then advance
  // to the login screen (onboarding finishes there, not here).
  const onNotifyRemind = async () => {
    let granted = false;
    try { granted = await requestPermissionAndEnableDefaults(); } catch { /* declined / no module */ }
    notifsOnRef.current = granted;
    logEvent('onboarding_notification_result', { granted: granted ? 'true' : 'false', source: 'onboarding' });
    goNext();
  };

  // Finish the whole flow (from the login step, or an early Skip). Emits
  // onboarding_complete (full profile) + durable user properties. Sign-in and
  // the sign_up event are handled by AuthContext via the SignInSheet.
  const finishAll = (method: 'completed' | 'skipped') => {
    saveAnswers(a);
    const notifsOn = notifsOnRef.current;
    const topics = a.topics ?? [];
    logEvent('onboarding_complete', {
      method,
      flow_version: FLOW_VERSION,
      last_step_index: step,
      notifications_enabled: notifsOn ? 'true' : 'false',
      goal: a.goal ?? '',
      age_range: a.age ?? '',
      bible_level: a.bibleLevel ?? '',
      topics: topics.join(','),
      topics_count: topics.length,
      time_commitment: a.timeCommitment ?? 0,
    });
    // Durable user properties — only the answered ones, plus the notif state.
    const props: Record<string, string | null> = { ob_notifications: notifsOn ? 'on' : 'off', ob_topics_count: String(topics.length) };
    if (a.goal) props.ob_goal = a.goal;
    if (a.age) props.ob_age_range = a.age;
    if (a.bibleLevel) props.ob_bible_level = a.bibleLevel;
    if (a.timeCommitment) props.ob_time_commitment = String(a.timeCommitment);
    setUserProps(props);
    onDone();   // RootNavigator wires this to OnboardingContext.finish()
  };

  const accent = ROSE;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {/* FULL-SCREEN confetti on the intro step. Rendered FIRST so every sibling
          (hero photo, title, sub, Continue) paints on top of it — the Lottie is
          strictly a backdrop. It starts on mount, i.e. the same moment the hero
          + text fade in. Plays ONCE at 0.8×. Negative insets bleed it past the
          root's 20px horizontal padding + top inset so it truly covers the
          screen; pointerEvents="none" so it can never swallow a tap. */}
      {stepName === 'intro' && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { left: -20, right: -20, top: -(insets.top + 6) }]}
        >
          <LottieView
            source={LOTTIE_CONFETTI}
            autoPlay
            loop={false}
            speed={0.8}
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      {/* Top bar: back (hidden on first step) + Skip-everything (hidden on the
          welcome/language step — skipping before a language is confirmed would
          strand a possibly-wrong-language user; a spacer keeps the layout). */}
      <View style={styles.topBar}>
        {stepName === 'paywall' ? (
          // Paywall: the ONLY dismissal is the X — it opens the free-trial
          // offer sheet (declining that continues onboarding). No back, no Skip.
          <TouchableOpacity onPress={() => setShowTrialSheet(true)} hitSlop={12} style={styles.backBtn}>
            <Feather name="x" size={24} color={TXTSUB} />
          </TouchableOpacity>
        ) : step > 0 ? (
          <TouchableOpacity onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={TXTSUB} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        {stepName !== 'language' && stepName !== 'paywall' ? (
          <TouchableOpacity onPress={() => finishAll('skipped')} hitSlop={12}>
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
      </View>

      {/* Progress — hidden on the welcome step (a cover, not a question) and
          on the paywall (an offer, not a step the user "progresses" through). */}
      {stepName !== 'language' && stepName !== 'paywall' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL) * 100}%` }]} />
        </View>
      ) : (
        <View style={[styles.progressTrack, { backgroundColor: 'transparent' }]} />
      )}

      <Animated.View key={step} entering={FadeInDown.duration(300)} style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {stepName === 'language' && (
            <>
              <View style={styles.center}>
                <LinearGradient colors={['#F9D9E6', '#F4A6C0', ROSE]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.welcomeHero}>
                  <Ionicons name="heart" size={40} color="#FFFFFF" style={{ opacity: 0.92 }} />
                </LinearGradient>
                {/* Brand tagline — fades in while rising from just below its
                    resting spot over 0.7s (per user; NOT an off-screen slide). */}
                <Animated.Text entering={FadeInUp.duration(700)} style={styles.tagline}>
                  {t('onboarding.welcome.tagline')}
                </Animated.Text>
                <Text style={[styles.sub, { textAlign: 'center', paddingHorizontal: 12 }]}>{t('onboarding.welcome.sub')}</Text>
              </View>
              {/* Language rows — nativeName labels never need translation. The
                  detected (or previously persisted) language is pre-selected;
                  tapping another row switches the WHOLE screen live via
                  setLang, which is itself the confirmation the choice took. */}
              {UI_LANGUAGES.map((l) => {
                const sel = lang === l.code;
                return (
                  <TouchableOpacity key={l.code} activeOpacity={0.85} onPress={() => setLang(l.code)} style={[styles.row, sel && styles.rowSel]}>
                    <Text style={[styles.rowText, { flex: 1 }]}>{l.nativeName}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {stepName === 'intro' && (
            <View style={styles.center}>
              <Image source={HERO_IMG} style={styles.hero} resizeMode="cover" />
              <Text style={[styles.h, { textAlign: 'center', marginTop: 22 }]}>{t('onboarding.intro.title')}</Text>
              <Text style={[styles.sub, { textAlign: 'center', paddingHorizontal: 16 }]}>{t('onboarding.intro.sub')}</Text>
            </View>
          )}

          {stepName === 'goal' && (
            <>
              <Text style={styles.h}>{t('onboarding.goal.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.goal.sub')}</Text>
              {GOAL_OPTS.map((o, i) => {
                const sel = a.goal === o.k;
                return (
                  <Animated.View key={o.k} entering={FadeInRight.duration(500).delay(i * 70)}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => pickSingle('goal', o.k)} style={[styles.row, sel && styles.rowSel]}>
                      <Ionicons name={o.icon as any} size={25} color={accent} style={[styles.rowIconBold, { textShadowColor: accent }]} />
                      <Text style={styles.rowText}>{t(`onboarding.goal.opt.${o.k}`)}</Text>
                      {sel && <Ionicons name="checkmark" size={20} color={accent} />}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'age' && (
            <>
              <Text style={styles.h}>{t('onboarding.age.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.age.sub')}</Text>
              {AGE_OPTS.map((o, i) => {
                const sel = a.age === o;
                return (
                  <Animated.View key={o} entering={FadeInRight.duration(500).delay(i * 70)}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => pickSingle('age', o)} style={[styles.row, sel && styles.rowSel]}>
                      <Text style={[styles.rowText, { flex: 1 }]}>{o}</Text>
                      {sel && <Ionicons name="checkmark" size={20} color={accent} />}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'bible' && (
            <>
              <Text style={styles.h}>{t('onboarding.bible.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.bible.sub')}</Text>
              {BIBLE_OPTS.map((o, i) => {
                const sel = a.bibleLevel === o.k;
                return (
                  <Animated.View key={o.k} entering={FadeInRight.duration(500).delay(i * 70)}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => pickSingle('bibleLevel', o.k)} style={[styles.card, sel && styles.rowSel]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle]}>{t(`onboarding.bible.opt.${o.k}`)}</Text>
                        {o.sub && <Text style={styles.cardSub}>{t(`onboarding.bible.opt.${o.k}.sub`)}</Text>}
                      </View>
                      {sel && <Ionicons name="checkmark" size={20} color={accent} />}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'encourage' && (
            <View style={styles.center}>
              <Image source={HERO_IMG} style={styles.hero} resizeMode="cover" />
              <Text style={[styles.h, { textAlign: 'center', marginTop: 22 }]}>{t('onboarding.encourage.title')}</Text>
              <Text style={[styles.sub, { textAlign: 'center', paddingHorizontal: 16 }]}>{t('onboarding.encourage.sub')}</Text>
            </View>
          )}

          {stepName === 'topics' && (
            <>
              <Text style={styles.h}>{t('onboarding.topics.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.topics.sub')}</Text>
              <View style={styles.chips}>
                {TOPIC_OPTS.map((k, i) => {
                  const sel = (a.topics ?? []).includes(k);
                  return (
                    <Animated.View key={k} entering={FadeInRight.duration(500).delay(i * 50)}>
                      <TouchableOpacity activeOpacity={0.85} onPress={() => toggleTopic(k)} style={[styles.chip, sel && styles.chipSel]}>
                        <Text style={[styles.chipText, sel && styles.chipTextSel]}>{t(`onboarding.topics.opt.${k}`)}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            </>
          )}

          {stepName === 'time' && (
            <>
              <Text style={styles.h}>{t('onboarding.time.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.time.sub')}</Text>
              {TIME_OPTS.map((min, i) => {
                const sel = a.timeCommitment === min;
                return (
                  <Animated.View key={min} entering={FadeInRight.duration(500).delay(i * 70)}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => pickSingle('timeCommitment', min)} style={[styles.card, sel && styles.rowSel]}>
                      <Text style={styles.timeNum}>{min} {t('onboarding.time.min')}</Text>
                      <Text style={[styles.timeSub, sel && { color: TXT }]}>{t(`onboarding.time.opt.${min}`)}</Text>
                      {sel && <Ionicons name="checkmark" size={20} color={accent} style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'remind' && (
            <>
              <Text style={styles.h}>{t('onboarding.remind.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.remind.sub')}</Text>
              <Animated.View entering={FadeInRight.duration(500)}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setEditing('morning')} style={styles.timeRow}>
                  <View style={styles.timeLabel}>
                    <Ionicons name="sunny-outline" size={23} color={ROSE} />
                    <Text style={styles.timeLabelText}>{t('onboarding.remind.morning')}</Text>
                  </View>
                  <Text style={[styles.timePill, { backgroundColor: '#FBEAF0', color: ROSE }]}>{to12h(settings.morning.hour, settings.morning.minute)}</Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View entering={FadeInRight.duration(500).delay(70)}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setEditing('night')} style={styles.timeRow}>
                  <View style={styles.timeLabel}>
                    <Ionicons name="moon-outline" size={22} color={LAV} />
                    <Text style={styles.timeLabelText}>{t('onboarding.remind.evening')}</Text>
                  </View>
                  <Text style={[styles.timePill, { backgroundColor: '#EEE9F8', color: LAV }]}>{to12h(settings.night.hour, settings.night.minute)}</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          {stepName === 'paywall' && (
            <>
              <Text style={styles.payTitle}>{t('obPaywall.title')}</Text>
              {/* Benefits — a few words each (per user, modeled on the reference). */}
              <View style={styles.payBenefits}>
                {(['b1', 'b2', 'b3', 'b4'] as const).map((k, i) => (
                  <Animated.View key={k} entering={FadeInRight.duration(500).delay(i * 60)} style={styles.payBenefitRow}>
                    <Feather name="check" size={19} color={ROSE} />
                    <Text style={styles.payBenefitText}>{t(`obPaywall.${k}`)}</Text>
                  </Animated.View>
                ))}
              </View>
              {/* Plan cards — lifetime (Best Value) / annual (Save 58%) / monthly. */}
              {PAY_PLANS.map((p, i) => {
                const sel = selectedPlan === p.id;
                return (
                  <Animated.View key={p.id} entering={FadeInRight.duration(500).delay(200 + i * 70)}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedPlan(p.id)}
                      style={[styles.payPlan, sel && styles.payPlanSel]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.payPlanLabel, sel && { color: ROSE }]}>{t(p.labelKey)}</Text>
                        <Text style={styles.payPlanSub}>
                          {t(`${p.labelKey}.priceLine`, { price: obPrices[p.id] })}
                        </Text>
                      </View>
                      <View style={[styles.payRadio, sel && styles.payRadioSel]}>
                        {sel && <Feather name="check" size={13} color="#FFFFFF" />}
                      </View>
                      {p.best && (
                        <View style={[styles.payBadge, { backgroundColor: ROSE }]}>
                          <Text style={styles.payBadgeText}>{t('obPaywall.badge.best')}</Text>
                        </View>
                      )}
                      {p.save != null && (
                        <View style={[styles.payBadge, { backgroundColor: '#F2A63B' }]}>
                          <Text style={styles.payBadgeText}>{t('obPaywall.badge.save', { pct: p.save })}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'notify' && (
            <>
              <Text style={[styles.h, { fontSize: 27 }]}>{t('onboarding.notify.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.notify.sub')}</Text>
              <LinearGradient colors={['#F9D9E6', '#F4A6C0', ROSE]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.notifHero}>
                <Ionicons name="notifications-outline" size={44} color="#FFFFFF" style={{ opacity: 0.5 }} />
                <View style={styles.banner}>
                  <View style={styles.bannerIcon}><Ionicons name="book" size={17} color="#FFFFFF" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerApp}>Her Bible</Text>
                    <Text style={styles.bannerBody} numberOfLines={1}>{t('onboarding.notify.banner')}</Text>
                  </View>
                </View>
              </LinearGradient>
            </>
          )}

          {stepName === 'login' && (
            <View style={{ alignItems: 'center' }}>
              <LinearGradient colors={['#F9D9E6', '#F4A6C0', ROSE]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.loginHero}>
                <Ionicons name="bookmark" size={42} color="#FFFFFF" style={{ opacity: 0.92 }} />
              </LinearGradient>
              <Text style={[styles.h, { fontSize: 26, textAlign: 'center', marginTop: 22 }]}>{t('onboarding.login.title')}</Text>
              <Text style={[styles.sub, { textAlign: 'center', paddingHorizontal: 10 }]}>{t('onboarding.login.sub')}</Text>
              <View style={styles.loginBenefits}>
                {([['create-outline', 'b1'], ['color-wand-outline', 'b2'], ['sync-outline', 'b3']] as const).map(([icon, k]) => (
                  <View key={k} style={styles.benefitRow}>
                    <View style={styles.benefitIcon}><Ionicons name={icon} size={19} color={ROSE} /></View>
                    <Text style={styles.benefitText}>{t(`onboarding.login.${k}`)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Bottom CTA — varies by step. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {stepName === 'notify' ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <PressBounce onPress={onNotifyRemind} style={styles.cta}>
              <Text style={styles.ctaText}>{t('onboarding.notify.cta')}</Text>
            </PressBounce>
            <TouchableOpacity onPress={goNext} hitSlop={10} style={styles.laterBtn}>
              <Text style={styles.laterText}>{t('onboarding.notify.later')}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : stepName === 'login' ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <PressBounce onPress={() => setShowSignIn(true)} style={styles.cta}>
              <Text style={styles.ctaText}>{t('onboarding.login.cta')}</Text>
            </PressBounce>
            <TouchableOpacity onPress={() => finishAll('completed')} hitSlop={10} style={styles.laterBtn}>
              <Text style={styles.laterText}>{t('onboarding.notify.later')}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : stepName === 'paywall' ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <PressBounce onPress={() => buyPlan(selectedPlan)} style={styles.cta} disabled={payBusy}>
              {payBusy
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.ctaText}>{t('obPaywall.cta')}</Text>}
            </PressBounce>
            {/* 3.1.2 compliance row: restore + terms + privacy. */}
            <View style={styles.payLinksRow}>
              <TouchableOpacity onPress={onRestore} hitSlop={8}>
                <Text style={styles.payLink}>{t('obPaywall.restore')}</Text>
              </TouchableOpacity>
              <Text style={styles.payLinkDot}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://covers.everlandapps.com/legal/support.html').catch(() => {})} hitSlop={8}>
                <Text style={styles.payLink}>{t('obPaywall.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.payLinkDot}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://covers.everlandapps.com/legal/privacy.html').catch(() => {})} hitSlop={8}>
                <Text style={styles.payLink}>{t('obPaywall.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (stepName === 'language' || stepName === 'intro' || stepName === 'encourage' || stepName === 'topics' || stepName === 'remind') ? (
          <PressBounce onPress={continueFrom} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.continue')}</Text>
          </PressBounce>
        ) : null}
      </View>

      {/* Reminder-time editor. */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing && (
          <TimePickerSheet
            initialHour={settings[editing].hour}
            initialMinute={settings[editing].minute}
            title={t(editing === 'morning' ? 'onboarding.remind.morning' : 'onboarding.remind.evening')}
            onConfirm={(h, m) => { setSchedule(editing, h, m); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Free-trial offer sheet — shown when the paywall's X is tapped (one
          last soft pitch before onboarding continues). Declining it in ANY way
          (X, backdrop, swipe-down) moves on to the next step. */}
      <Modal visible={showTrialSheet} transparent animationType="none" onRequestClose={declineTrial} statusBarTranslucent>
        <View style={styles.trialOverlay}>
          <TouchableOpacity style={styles.trialBackdrop} activeOpacity={1} onPress={declineTrial} />
          <GestureDetector gesture={trialPan}>
            <Animated.View style={[styles.trialSheet, trialSheetStyle]}>
              <View style={styles.trialHandle} />
              <TouchableOpacity onPress={declineTrial} hitSlop={12} style={styles.trialClose}>
                <Feather name="x" size={20} color={TXTSUB} />
              </TouchableOpacity>
              {/* Brand gift box — user-provided art, cleaned (green-screen
                  fringe + dark ribbon outline removed, alpha re-feathered). */}
              <Image source={GIFT_BOX} style={styles.trialGiftImg} resizeMode="contain" />
              <Text style={styles.trialTitle}>{t('obTrial.title')}</Text>
              {(['b1', 'b2', 'b3'] as const).map((k, i) => (
                <Animated.View key={k} entering={FadeInRight.duration(450).delay(120 + i * 60)} style={styles.payBenefitRow}>
                  <Feather name="check" size={18} color={ROSE} />
                  <Text style={styles.payBenefitText}>{t(`obTrial.${k}`)}</Text>
                </Animated.View>
              ))}
              <Text style={styles.trialPriceLine}>{t('obTrial.priceLine', { price: obPrices.annual })}</Text>
              <PulseCta onPress={() => buyPlan('annual')} style={styles.cta} disabled={payBusy}>
                {payBusy
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.ctaText}>{t('obTrial.cta')}</Text>}
              </PulseCta>
            </Animated.View>
          </GestureDetector>
        </View>
      </Modal>

      {/* Final login screen's sign-in sheet. Closing it (success OR cancel)
          finishes onboarding; the sign_up event is fired by AuthContext. */}
      {showSignIn && (
        <SignInSheet onClose={() => { setShowSignIn(false); finishAll('completed'); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  backBtn: { width: 32, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  skip: { fontSize: 16.8, fontWeight: '600', color: ROSE, fontFamily: FONTS.lato },   // 14 → 16.8 (+20 % per user)
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(230,63,105,0.16)', marginTop: 8, marginBottom: 18 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: ROSE },
  content: { flex: 1 },
  scroll: { paddingBottom: 12 },
  center: { alignItems: 'center' },
  // Question titles now use the SAME typeface as the option rows (Lato, in its
  // bold cut) instead of the Lora serif — per user, so the whole step reads in
  // one type family. marginTop 20 = the requested extra space above the title.
  h: {
    fontSize: 24, color: TXT, fontFamily: FONTS.latoBold, fontWeight: '700',
    lineHeight: 31, letterSpacing: -0.2, marginTop: 20, marginBottom: 7,
  },
  sub: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, lineHeight: 22, marginBottom: 16 },   // 13.5 → 15 (+10 % content type per user)
  // Single-line option row.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 16.8, paddingHorizontal: 14, marginBottom: 9,   // 14 → 16.8 (row height +15 % per user)
  },
  rowSel: { backgroundColor: '#FBEAF0', borderWidth: 1.5, borderColor: ROSE },
  rowText: { flex: 1, fontSize: 18, color: TXT, fontFamily: FONTS.lato },   // 16.5 → 18 (2nd +10 % round per user)
  // Ionicons is an icon FONT, so there's no strokeWidth to raise. A tight
  // same-colour shadow thickens the glyph instead — the "+20 % bolder" the user
  // asked for. (True stroke control would mean swapping to SVG icons.)
  rowIconBold: { textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0.7 },
  // Two-line card (bible level / time commitment).
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 13, paddingHorizontal: 14, marginBottom: 9,
  },
  cardTitle: { fontSize: 18, color: TXT, fontFamily: FONTS.lato },   // 16.5 → 18 (2nd +10 %)
  cardSub: { fontSize: 15.5, color: 'rgba(30,27,46,0.42)', fontFamily: FONTS.lato, marginTop: 2 },   // 14 → 15.5 (2nd +10 %)
  timeNum: { fontSize: 22, color: ROSE, fontFamily: FONTS.loraBold, fontWeight: '600', width: 80 },   // 20 → 22 (2nd +10 %); width 72 → 80
  timeSub: { flex: 1, fontSize: 16, color: 'rgba(30,27,46,0.55)', fontFamily: FONTS.lato },   // 14.5 → 16 (2nd +10 %)
  // Chips (topics, multi-select).
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.12)',
    borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16,
  },
  chipSel: { backgroundColor: ROSE, borderColor: ROSE },
  chipText: { fontSize: 17, color: TXT, fontFamily: FONTS.lato },   // 15.5 → 17 (2nd +10 %)
  chipTextSel: { color: '#FFFFFF', fontWeight: '700' },
  // Encouragement interstitial.
  hero: { width: '100%', aspectRatio: 1.5, borderRadius: 22, marginTop: 6 },
  // Time-picker rows (reminder step).
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11,
  },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeLabelText: { fontSize: 18, color: TXT, fontFamily: FONTS.lato },   // 16.5 → 18 (2nd +10 %)
  timePill: { fontSize: 18, fontWeight: '700', paddingVertical: 9, paddingHorizontal: 17, borderRadius: 12, overflow: 'hidden' },   // 16.5 → 18 (2nd +10 %)
  // Notification hero + mock banner.
  notifHero: { width: '100%', height: 188, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4, overflow: 'hidden' },
  loginHero: { width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  // Welcome/language step brand mark — same gradient family, slightly smaller
  // so the 7 language rows fit without scrolling on compact phones.
  welcomeHero: { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  // Brand tagline under the welcome mark — 70% of the reference screenshot's
  // display size (per user), Lora 600 (never 700 on Android).
  tagline: {
    fontSize: 28, lineHeight: 36, fontFamily: FONTS.loraBold, fontWeight: '600',
    color: TXT, textAlign: 'center', marginTop: 18, paddingHorizontal: 8, marginBottom: 6,
  },
  // ── Onboarding paywall ──
  payTitle: {
    fontSize: 30, fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    marginTop: 2, marginBottom: 16,
  },
  payBenefits: { gap: 11, marginBottom: 22 },
  payBenefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payBenefitText: { fontSize: 16.5, color: TXT, fontFamily: FONTS.lato },
  payPlan: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11,
  },
  payPlanSel: { borderColor: ROSE, backgroundColor: '#FBEAF0' },
  payPlanLabel: { fontSize: 18, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold },
  payPlanSub: { fontSize: 14.5, color: TXTSUB, fontFamily: FONTS.lato, marginTop: 3 },
  payRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(30,27,46,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  payRadioSel: { backgroundColor: ROSE, borderColor: ROSE },
  payBadge: {
    position: 'absolute', top: -9, right: 14,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9,
  },
  payBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF', fontFamily: FONTS.latoBold },
  payLinksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  payLink: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, textDecorationLine: 'underline' },
  payLinkDot: { color: TXTSUB, fontSize: 12.5 },
  // ── Free-trial offer sheet ──
  trialOverlay: { flex: 1, justifyContent: 'flex-end' },
  trialBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,16,28,0.42)' },
  trialSheet: {
    height: TRIAL_SHEET_H,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 24, paddingBottom: 22,
  },
  trialHandle: {
    alignSelf: 'center', width: 42, height: 4.5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.18)', marginTop: 10, marginBottom: 4,
  },
  trialClose: {
    position: 'absolute', top: 16, right: 16, zIndex: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(30,27,46,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  trialGiftImg: { width: 96, height: 96, marginTop: 8, marginBottom: 14 },
  trialTitle: {
    fontSize: 28, fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, marginBottom: 16,
  },
  trialPriceLine: { fontSize: 14, color: TXTSUB, fontFamily: FONTS.lato, textAlign: 'center', marginTop: 16, marginBottom: 12 },
  loginBenefits: { alignSelf: 'stretch', marginTop: 22, gap: 14, paddingHorizontal: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  benefitIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FBEAF0', alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 16, color: TXT, fontFamily: FONTS.lato, lineHeight: 22 },   // 14.5 → 16 (+10 %)
  banner: {
    position: 'absolute', left: 14, right: 14, bottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center' },
  bannerApp: { fontSize: 12.5, fontWeight: '700', color: TXT, fontFamily: FONTS.lato },
  bannerBody: { fontSize: 12, color: 'rgba(30,27,46,0.62)', fontFamily: FONTS.lato },
  // Footer CTA.
  footer: { paddingTop: 6 },
  cta: { backgroundColor: ROSE, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  ctaText: { fontSize: 16.5, fontWeight: '700', color: '#FFFFFF', fontFamily: FONTS.latoBold, letterSpacing: 0.2 },
  laterBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  laterText: { fontSize: 14, color: 'rgba(30,27,46,0.45)', fontFamily: FONTS.lato },
});
