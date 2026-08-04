import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, ActivityIndicator, Linking, Dimensions, Image, Platform, TextInput } from 'react-native';
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
import { ROSE, BTN_RADIUS, LAV, TXT, TXTSUB, BG, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useOnboarding, type OnboardingAnswers } from '../state/OnboardingContext';
import { useNotifications } from '../state/NotificationsContext';
import { useUILanguage, UI_LANGUAGES } from '../state/UILanguageContext';
import { logEvent, setUserProps } from '../services/firebase';
import TimePickerSheet from '../components/TimePickerSheet';
import { GoogleGlyph, AppleGlyph } from '../components/SignInSheet';
import Logo from '../components/shared/Logo';
import { useProviderSignIn } from '../hooks/useProviderSignIn';
import { useAuth } from '../state/AuthContext';
import { warmupGoogleSignIn } from '../services/firebaseAuth';
import { flushPendingRemount } from '../services/cloudBackup';
import { maybeShowOnboardingInterstitial } from '../services/ads';
import { initIap, fetchPrices, purchasePlan, restorePurchases, type PlanId } from '../services/iap';

// New-user onboarding (first launch only — gated in RootNavigator). Flow v4:
// welcome + language picker → short intro interstitial → questionnaire →
// notification soft pre-prompt → login page → paywall (the subscription pitch
// comes LAST, only after the login choice). Single-select questions auto-advance
// on tap; topics is multi-select. Answers persist via OnboardingContext and
// tailor later content. The mood check-in is gated on onboarding.done
// (MoodCheckInContext), so it only ever asks AFTER the user lands in the app.

const TOTAL = 12;

// Analytics step names (snake_case, index-aligned). `step_name` is the
// canonical funnel key for BigQuery — indexes shifted in flow v2 (language +
// intro prepended), v3 (paywall inserted after remind) and v4 (paywall moved
// to the END — the subscription pitch must come only after the login choice,
// right before entering the app, per user). Events carry flow_version.
// Never renumber names; future steps get NEW names.
const STEP_NAMES = ['language', 'intro', 'goal', 'age', 'bible', 'encourage', 'topics', 'time', 'remind', 'notify', 'login', 'paywall'] as const;
const FLOW_VERSION = 4;

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

// Hosted legal pages — linked from the paywall footer and the login page.
const LEGAL_TERMS_URL = 'https://covers.everlandapps.com/legal/support.html';
const LEGAL_PRIVACY_URL = 'https://covers.everlandapps.com/legal/privacy.html';

const TRIAL_SHEET_H = Math.round(Dimensions.get('window').height * 0.56);
const GIFT_BOX = require('../../assets/paywall/gift-box.png');
// Two 16:9 hero photos (1600×900 webp, ≤150 KB each — cropped/compressed from
// the user's originals, bundled into the binary so they're offline-ready).
const HERO_INTRO_IMG = require('../../assets/onboarding-hero-intro.webp');
const HERO_ENCOURAGE_IMG = require('../../assets/onboarding-hero-encourage.webp');
// Full-screen celebration behind the intro step. This is the SAME animation as
// the user's "Free Flex Confetti" dotLottie (byte-identical once extracted), so
// we reuse the asset already in the bundle instead of adding a duplicate.
const LOTTIE_CONFETTI = require('../../assets/lottie/confetti.json');
// The REAL app icon — used in the mock notification banner so the preview looks
// like an actual Her Bible notification rather than a generic glyph.
const APP_ICON = require('../../assets/icon.png');

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

// Login-page provider button: the SAME white card as the questionnaire option
// rows (radius / border / padding all match styles.row), content centered.
// While `busy`, the brand glyph swaps for a spinner; `disabled` dims the
// sibling rows so only one OAuth flow runs at a time.
function LoginProviderRow({ glyph, label, onPress, busy, disabled }: {
  glyph: React.ReactNode; label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
}) {
  return (
    <PressBounce onPress={onPress} disabled={disabled} style={[styles.loginProviderRow, disabled && !busy ? { opacity: 0.5 } : null]}>
      {busy ? <ActivityIndicator size="small" color={ROSE} /> : glyph}
      <Text style={styles.loginProviderText}>{label}</Text>
    </PressBounce>
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

// Prayer-topic chips (multi-select). Each key MUST have a matching entry in
// TOPIC_TAGS (services/planRecommendations.ts) or the selection is captured but
// never influences the recommended plans. Order here is purely visual.
const TOPIC_OPTS = ['anxiety', 'hope', 'gratitude', 'family', 'marriage', 'belonging', 'strength', 'healing', 'identity', 'purpose', 'faith', 'sleep'] as const;

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
  const notifsOnRef = useRef(false);   // set at the notify step; read by finishAll
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);   // pending single-select auto-advance
  // Language step: when detection pre-selects one of the two Chinese rows
  // (list positions 6/7, below the fold), scroll them into view on entry so
  // the user SEES their language already chosen instead of assuming English.
  const langScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (stepName !== 'language') return;
    const idx = UI_LANGUAGES.findIndex(l => l.code === lang);
    if (idx >= 5) {
      const timer = setTimeout(() => langScrollRef.current?.scrollToEnd({ animated: false }), 80);
      return () => clearTimeout(timer);
    }
    // Entry-only: not re-run on row taps (lang deliberately out of the deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepName]);
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
      // Pre-warm Google's native stack while the user reads the page, so the
      // account picker appears instantly on tap instead of stalling.
      warmupGoogleSignIn();
    }
  }, [stepName]);

  // ── Login page (step 'login') — full-page sign-in, no bottom sheet ────────
  // OAuth success moves on to the final paywall step (AuthContext logs the
  // sign_up event); onboarding itself finishes when the paywall resolves.
  const [loginError, setLoginError] = useState<string | null>(null);
  const { busy: loginBusy, onGoogle, onApple } = useProviderSignIn({
    onSuccess: () => goNext(),
    onError: (msg) => setLoginError(msg),
  });
  // Email magic-link sub-flow, inline on the page: 'providers' = the button
  // stack, 'email' = the entry form, then `emailSent` = "check your inbox".
  const { sendEmailLink } = useAuth();
  const [loginMode, setLoginMode] = useState<'providers' | 'email'>('providers');
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const onSendEmail = async () => {
    if (emailBusy || !emailValid) return;
    setEmailBusy(true);
    try {
      await sendEmailLink(email.trim());
      setEmailSent(true);
    } catch {
      setLoginError(t('signIn.email.error'));
    } finally {
      setEmailBusy(false);
    }
  };

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
  const [notifyBusy, setNotifyBusy] = useState(false);   // notify step: OS-permission request in flight
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
        finishAll('completed');   // paywall is the last step — done, enter the app
      }
    } finally { setPayBusy(false); }
  };
  const onRestore = async () => {
    if (payBusy) return;
    setPayBusy(true);
    try { if (await restorePurchases()) { setShowTrialSheet(false); finishAll('completed'); } }
    finally { setPayBusy(false); }
  };
  // Declining the trial sheet (X / backdrop / swipe-down) finishes onboarding
  // — the paywall is the final step, so the user lands in the app.
  const declineTrial = () => { setShowTrialSheet(false); finishAll('completed'); };
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
  // to the login page (onboarding finishes after the final paywall step).
  const onNotifyRemind = async () => {
    if (notifyBusy) return;                 // guard against double-taps during the await
    setNotifyBusy(true);                    // synchronous → the button shows its spinner THIS frame
    let granted = false;
    try { granted = await requestPermissionAndEnableDefaults(); } catch { /* declined / no module */ }
    notifsOnRef.current = granted;
    logEvent('onboarding_notification_result', { granted: granted ? 'true' : 'false', source: 'onboarding' });
    setNotifyBusy(false);
    goNext();
  };

  // Finish the whole flow (login-page X / OAuth success, or an early Skip).
  // Emits onboarding_complete (full profile) + durable user properties; the
  // sign_up event itself is logged by AuthContext when auth flips on.
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
    // If a sign-in during onboarding restored cloud progress, the provider-tree
    // remount was deferred to here (a remount mid-flow would reset the flow).
    // Give finish()'s AsyncStorage write a beat to land before re-hydrating.
    setTimeout(flushPendingRemount, 250);
  };

  const accent = ROSE;
  // Split the encourage line around the emphasised phrase (see the JSX below).
  const encourageSubParts = t('onboarding.encourage.sub').split('{highlight}');
  const notifySubParts = t('onboarding.notify.sub').split('{highlight}');

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {/* FULL-SCREEN confetti on the encourage step. Rendered FIRST so every sibling
          (hero photo, title, sub, Continue) paints on top of it — the Lottie is
          strictly a backdrop. It starts on mount, i.e. the same moment the hero
          + text fade in. Plays ONCE at 0.8×. Negative insets bleed it past the
          root's 20px horizontal padding + top inset so it truly covers the
          screen; pointerEvents="none" so it can never swallow a tap. */}
      {stepName === 'encourage' && (
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
        ) : step > 0 && stepName !== 'login' ? (
          <TouchableOpacity onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={TXTSUB} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        {stepName === 'login' ? (
          // Login page: the only dismissal is the top-right X — it moves on
          // to the final paywall step (mirrors the reference layout).
          <TouchableOpacity onPress={goNext} hitSlop={12} style={[styles.backBtn, { alignItems: 'flex-end' }]}>
            <Feather name="x" size={24} color={TXTSUB} />
          </TouchableOpacity>
        ) : stepName !== 'language' && stepName !== 'paywall' ? (
          <TouchableOpacity onPress={() => finishAll('skipped')} hitSlop={12}>
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
      </View>

      {/* Progress — hidden on the welcome step (a cover, not a question), on
          the login page and on the paywall (offers, not steps the user
          "progresses" through). */}
      {stepName !== 'language' && stepName !== 'paywall' && stepName !== 'login' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL) * 100}%` }]} />
        </View>
      ) : (
        <View style={[styles.progressTrack, { backgroundColor: 'transparent' }]} />
      )}

      <Animated.View key={step} entering={FadeInDown.duration(300)} style={styles.content}>
        <ScrollView ref={langScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {stepName === 'language' && (
            <>
              <View style={styles.center}>
                <Image source={APP_ICON} style={styles.welcomeHero} resizeMode="cover" />
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
              {UI_LANGUAGES.map((l, i) => {
                const sel = lang === l.code;
                return (
                  <Animated.View key={l.code} entering={FadeInRight.duration(500).delay(i * 70)}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setLang(l.code)} style={[styles.row, sel && styles.rowSel]}>
                      <Text style={[styles.rowText, { flex: 1 }]}>{l.nativeName}</Text>
                      {sel && <Ionicons name="checkmark" size={20.7} color={accent} style={[styles.checkBold, { textShadowColor: accent }]} />}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {stepName === 'intro' && (
            <View style={styles.center}>
              <View style={styles.hero}>
                <Image source={HERO_INTRO_IMG} style={styles.heroImg} resizeMode="cover" />
              </View>
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
              <View style={styles.hero}>
                <Image source={HERO_ENCOURAGE_IMG} style={styles.heroImg} resizeMode="cover" />
              </View>
              <Text style={[styles.h, { textAlign: 'center', marginTop: 22 }]}>{t('onboarding.encourage.title')}</Text>
              {/* "2 million women" is pulled out of the sentence via a {highlight}
                  token so it can be rendered bigger/bold/rose in EVERY language
                  (word order differs per locale — a hardcoded split would only
                  work in English). If a translation lacks the token, split()
                  returns one part and the line renders plain — graceful. */}
              <Text style={[styles.sub, styles.encourageSub, { textAlign: 'center', paddingHorizontal: 16 }]}>
                {encourageSubParts[0]}
                {encourageSubParts.length > 1 && (
                  <Text style={styles.encourageSubHL}>{t('onboarding.encourage.subHighlight')}</Text>
                )}
                {encourageSubParts[1] ?? ''}
              </Text>
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
              {/* The "2.5×" multiplier is pulled out via a {highlight} token so
                  it renders bigger/bold/rose in EVERY language (word order +
                  decimal separator differ per locale). Missing token → one
                  part → plain line. */}
              <Text style={styles.sub}>
                {notifySubParts[0]}
                {notifySubParts.length > 1 && (
                  <Text style={styles.notifySubHL}>{t('onboarding.notify.subHighlight')}</Text>
                )}
                {notifySubParts[1] ?? ''}
              </Text>
              <LinearGradient colors={['#F9D9E6', '#F4A6C0', ROSE]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.notifHero}>
                <Ionicons name="notifications-outline" size={44} color="#FFFFFF" style={{ opacity: 0.5 }} />
                {/* Mock heads-up notification. Pinned to the TOP of the hero —
                    that's where real notifications drop from. Uses the REAL app
                    icon and the REAL morning-reminder copy (notif.push.morning),
                    so the preview matches what the user will actually receive. */}
                <View style={styles.banner}>
                  <Image source={APP_ICON} style={styles.bannerIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerApp}>HER BIBLE</Text>
                    <Text style={styles.bannerBody} numberOfLines={2}>{t('notif.push.morning.body.1')}</Text>
                  </View>
                </View>
              </LinearGradient>
            </>
          )}

          {stepName === 'login' && (
            <View>
              {/* Brand row — icon logo + pink wordmark (reference layout). */}
              <View style={styles.loginBrandRow}>
                <Logo size={34.5} />
                <Text style={styles.loginBrandName}>HER BIBLE</Text>
              </View>
              <Text style={styles.loginTitle}>{t('onboarding.login.title')}</Text>
              <Text style={[styles.sub, { marginBottom: 0 }]}>{t('onboarding.login.sub')}</Text>

              {loginMode === 'providers' ? (
                <>
                  <View style={{ marginTop: 34 }}>
                    {Platform.OS === 'ios' && (
                      // Apple HIG: Sign in with Apple sits at-or-above the others.
                      <LoginProviderRow
                        glyph={<AppleGlyph color={TXT} />}
                        label={t('signIn.apple')}
                        onPress={onApple}
                        busy={loginBusy === 'apple'}
                        disabled={loginBusy !== null}
                      />
                    )}
                    <LoginProviderRow
                      glyph={<GoogleGlyph />}
                      label={t('signIn.google')}
                      onPress={onGoogle}
                      busy={loginBusy === 'google'}
                      disabled={loginBusy !== null}
                    />
                    <LoginProviderRow
                      glyph={<Feather name="mail" size={20} color={TXT} />}
                      label={t('signIn.email')}
                      onPress={() => { setLoginError(null); setLoginMode('email'); }}
                      disabled={loginBusy !== null}
                    />
                  </View>
                  {loginError && <Text style={styles.loginError}>{loginError}</Text>}
                  {/* Legal line — the {terms} / {privacy} tokens in the i18n
                      template become tappable links to the hosted pages. */}
                  <Text style={styles.loginLegal}>
                    {t('signIn.legal').split(/(\{terms\}|\{privacy\})/g).map((p, i) => {
                      if (p === '{terms}') return <Text key={i} style={styles.loginLegalLink} onPress={() => Linking.openURL(LEGAL_TERMS_URL).catch(() => {})}>{t('signIn.legal.terms')}</Text>;
                      if (p === '{privacy}') return <Text key={i} style={styles.loginLegalLink} onPress={() => Linking.openURL(LEGAL_PRIVACY_URL).catch(() => {})}>{t('signIn.legal.privacy')}</Text>;
                      return p;
                    })}
                  </Text>
                </>
              ) : (
                <View style={{ marginTop: 26 }}>
                  <TouchableOpacity onPress={() => { setLoginMode('providers'); setEmailSent(false); }} hitSlop={10} style={styles.loginEmailBack}>
                    <Feather name="chevron-left" size={22} color={TXTSUB} />
                    <Text style={styles.loginEmailBackText}>{t('signIn.email.back')}</Text>
                  </TouchableOpacity>
                  {!emailSent ? (
                    <>
                      <Text style={styles.loginEmailTitle}>{t('signIn.email.title')}</Text>
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder={t('signIn.email.placeholder')}
                        placeholderTextColor={TXTSUB}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        editable={!emailBusy}
                        style={styles.loginEmailInput}
                        onSubmitEditing={onSendEmail}
                        returnKeyType="send"
                      />
                      <PressBounce onPress={onSendEmail} disabled={!emailValid || emailBusy} style={[styles.cta, (!emailValid || emailBusy) ? { opacity: 0.5 } : null]}>
                        {emailBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>{t('signIn.email.send')}</Text>}
                      </PressBounce>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                      <Feather name="mail" size={34} color={ROSE} style={{ marginBottom: 12 }} />
                      <Text style={styles.loginEmailTitle}>{t('signIn.email.sent.title')}</Text>
                      <Text style={styles.loginEmailSentBody}>{t('signIn.email.sent.body', { email: email.trim() })}</Text>
                      <TouchableOpacity onPress={() => setEmailSent(false)} hitSlop={8}>
                        <Text style={styles.loginEmailChange}>{t('signIn.email.changeEmail')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Bottom CTA — varies by step. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {stepName === 'notify' ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <PressBounce onPress={onNotifyRemind} style={styles.cta} disabled={notifyBusy}>
              {notifyBusy
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.ctaText}>{t('onboarding.notify.cta')}</Text>}
            </PressBounce>
            <TouchableOpacity onPress={goNext} hitSlop={10} style={styles.laterBtn} disabled={notifyBusy}>
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
              <TouchableOpacity onPress={() => Linking.openURL(LEGAL_TERMS_URL).catch(() => {})} hitSlop={8}>
                <Text style={styles.payLink}>{t('obPaywall.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.payLinkDot}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(LEGAL_PRIVACY_URL).catch(() => {})} hitSlop={8}>
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
            // 18:00 is the boundary: evening prayer opens then, so the evening
            // reminder can't sit before it and the morning one can't cross it.
            minHour={editing === 'night' ? 18 : 0}
            maxHour={editing === 'morning' ? 17 : 23}
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
                <Animated.View key={k} entering={FadeInRight.duration(450).delay(120 + i * 60)} style={[styles.payBenefitRow, styles.trialBenefitRow]}>
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

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  backBtn: { width: 32, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  skip: { fontSize: 16.8, fontWeight: '600', color: ROSE, fontFamily: FONTS.lato, letterSpacing: 0.4 },   // 14 → 16.8 (+20 % per user)
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(230,63,105,0.16)', marginTop: 8, marginBottom: 18 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: ROSE },
  content: { flex: 1 },
  // Bottom padding clears the PINNED footer CTA (16×2 vertical padding + text
  // ≈ 56pt + its top inset): with the old 12pt, the language step's last rows
  // (Deutsch/中文) slid UNDER the floating Continue button — visually colliding
  // and hiding a pre-selected Chinese row entirely.
  scroll: { paddingBottom: 96 },
  center: { alignItems: 'center' },
  // Question titles now use the SAME typeface as the option rows (Lato, in its
  // bold cut) instead of the Lora serif — per user, so the whole step reads in
  // one type family. marginTop 20 = the requested extra space above the title.
  h: {
    fontSize: 24, color: TXT, fontFamily: FONTS.latoBold, fontWeight: '700',
    lineHeight: 31, letterSpacing: -0.2, marginTop: 20, marginBottom: 7,
  },
  sub: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, lineHeight: 22, marginBottom: 16 },   // 13.5 → 15 (+10 % content type per user)
  // Encourage step's line: +20 % type and the SAME colour as the option rows
  // (TXT, not the muted TXTSUB). lineHeight is raised so the larger inline
  // highlight below isn't clipped.
  encourageSub: { fontSize: 18, lineHeight: 32, color: TXT },   // 15 → 18 (+20 % per user)
  // "2 million women" — bold, +40 % over the line, in the option-button rose.
  encourageSubHL: { fontSize: 25.2, color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.4, fontWeight: '700' },   // 18 × 1.4
  notifySubHL: { fontSize: 19.5, color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.4, fontWeight: '700' },   // sub 15 × 1.3 (+30 % per user), rose + bold
  // Single-line option row.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 21.5, paddingHorizontal: 14, marginBottom: 9,   // 16.8 → 21.5: box height ~59.6→69px (+15 %, round up); type/leading/centering unchanged (per user)
  },
  rowSel: { backgroundColor: '#FBEAF0', borderWidth: 1.5, borderColor: ROSE },
  rowText: { flex: 1, fontSize: 18, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },   // 16.5 → 18 (2nd +10 % round per user)
  // Ionicons is an icon FONT, so there's no strokeWidth to raise. A tight
  // same-colour shadow thickens the glyph instead — the "+20 % bolder" the user
  // asked for. (True stroke control would mean swapping to SVG icons.)
  rowIconBold: { textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0.7 },
  // Selected-language check — 2× the rowIconBold shadow so the glyph reads
  // clearly heavier (per user: "加粗 2x + 放大 15%"; size bumped 18 → 20.7).
  checkBold: { textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1.4 },
  // Two-line card (bible level / time commitment).
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 18.4, paddingHorizontal: 14, marginBottom: 9,   // 13 → 18.4: box height ~69.2→80px (+15 %, round up); title/sub type/leading/centering unchanged (per user)
  },
  cardTitle: { fontSize: 18, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.5 },   // 16.5 → 18 (2nd +10 %)
  cardSub: { fontSize: 15.5, color: 'rgba(30,27,46,0.42)', fontFamily: FONTS.lato, letterSpacing: 0.4, marginTop: 2 },   // 14 → 15.5 (2nd +10 %)
  timeNum: { fontSize: 22, color: ROSE, fontFamily: FONTS.loraBold, fontWeight: '600', width: 80 },   // 20 → 22 (2nd +10 %); width 72 → 80
  timeSub: { flex: 1, fontSize: 16, color: 'rgba(30,27,46,0.55)', fontFamily: FONTS.lato, letterSpacing: 0.4 },   // 14.5 → 16 (2nd +10 %)
  // Chips (topics, multi-select).
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.12)',
    borderRadius: 25, paddingVertical: 14.3, paddingHorizontal: 16,   // pV 10 → 14.3: chip height ~41.4 → 50px (+20 %, round up); radius 22 → 25 keeps the full pill at the taller height. Type/leading/centering unchanged (per user)
  },
  chipSel: { backgroundColor: ROSE, borderColor: ROSE },
  chipText: { fontSize: 17, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },   // 15.5 → 17 (2nd +10 %)
  chipTextSel: { color: '#FFFFFF', fontWeight: '700' },
  // Intro / encouragement hero.
  // The hero is a WRAPPER VIEW that owns the layout (an animated-webp source
  // once ignored the Image's aspectRatio box on device and blew up to
  // full-screen portrait, pushing the copy + CTA out of view — P0). The image
  // absolute-fills it with resizeMode="cover". aspectRatio matches the 16:9
  // (1600×900) sources exactly so the full curated crop shows — a mismatched
  // screen so the title, subtitle and Continue always fit above the fold.
  // The asset is EXACTLY 16:9, so the box is too — then `cover` shows the whole
  // photo and can never crop to a corner. maxHeight was removed on purpose: with
  // a fixed aspectRatio it could only ever make the box SHORTER than 16:9, which
  // silently turned `cover` into a side-crop on short screens. At 16:9 the hero
  // is ~24 % of a typical screen's height, well inside the old 34 % cap, so the
  // copy below it still clears the fold on an SE-class device.
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: 30, marginTop: 6, overflow: 'hidden' },
  // Explicit 100 %/100 % rather than absoluteFillObject — an absolutely
  // positioned child that fails to resolve its insets renders at the image's
  // INTRINSIC size (1600 × 900) anchored top-left, which is exactly the
  // "zoomed into the top-left corner" symptom. A relative child sized to the
  // parent cannot do that.
  heroImg: { width: '100%', height: '100%' },
  // Time-picker rows (reminder step).
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 30, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 19.5, paddingHorizontal: 16, marginBottom: 11,   // 15 → 19.5 (+30 % row height per user; the row is padding-driven, no fixed height)
  },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeLabelText: { fontSize: 18, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },   // 16.5 → 18 (2nd +10 %)
  timePill: { fontSize: 18, fontWeight: '700', paddingVertical: 9, paddingHorizontal: 17, borderRadius: 12, overflow: 'hidden' },   // 16.5 → 18 (2nd +10 %)
  // Notification hero + mock banner.
  // paddingTop reserves the strip the (now top-pinned) mock banner occupies, so
  // the centred bell glyph settles BELOW it instead of colliding with it.
  notifHero: { width: '100%', height: 188, borderRadius: 30, alignItems: 'center', justifyContent: 'center', paddingTop: 72, marginTop: 4, overflow: 'hidden' },
  // ── Login page (reference layout: brand row → big title → provider stack) ──
  loginBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  loginBrandName: { fontSize: 21, color: ROSE, fontFamily: FONTS.loraBold, fontWeight: '600' },
  loginTitle: {
    fontSize: 30, color: TXT, fontFamily: FONTS.latoBold, fontWeight: '700',
    lineHeight: 39, letterSpacing: -0.3, marginTop: 20, marginBottom: 8,
  },
  // Provider button = the questionnaire option card (same radius / border /
  // padding / 18-pt type as styles.row), content centered.
  loginProviderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',   // radius tracks styles.row (user: identical cards)
    paddingVertical: 16.8, paddingHorizontal: 14, marginBottom: 9,
  },
  loginProviderText: { fontSize: 18, color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.4, fontWeight: '700' },
  loginError: { fontSize: 13.5, color: ROSE, fontFamily: FONTS.lato, letterSpacing: 0.4, textAlign: 'center', marginTop: 8 },
  loginLegal: { fontSize: 12.5, lineHeight: 19, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, textAlign: 'center', marginTop: 18, paddingHorizontal: 6 },
  loginLegalLink: { color: ROSE, fontWeight: '600' },
  loginEmailBack: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4 },
  loginEmailBackText: { fontSize: 15, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, fontWeight: '500' },
  loginEmailTitle: { fontSize: 18, color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.5, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  loginEmailInput: {
    height: 54, borderRadius: 15, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingHorizontal: 16, fontSize: 17, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4, backgroundColor: '#FFFFFF', marginBottom: 14,
  },
  loginEmailSentBody: { fontSize: 14.5, lineHeight: 21, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, textAlign: 'center', marginBottom: 16, paddingHorizontal: 8 },
  loginEmailChange: { fontSize: 14, fontWeight: '700', color: ROSE, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
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
  payBenefitText: { fontSize: 16.5, color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },
  payPlan: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11,
  },
  payPlanSel: { borderColor: ROSE, backgroundColor: '#FBEAF0' },
  payPlanLabel: { fontSize: 18, fontWeight: '700', color: TXT, fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  payPlanSub: { fontSize: 14.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, marginTop: 3 },
  payRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(30,27,46,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  payRadioSel: { backgroundColor: ROSE, borderColor: ROSE },
  payBadge: {
    position: 'absolute', top: -9, right: 14,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9,
  },
  payBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  payLinksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  payLink: { fontSize: 12.5, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, textDecorationLine: 'underline' },
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
  // Air between the trial sheet's benefit lines (they sit directly on
  // payBenefitRow, which has no vertical spacing of its own).
  trialBenefitRow: { marginBottom: 13 },
  trialTitle: {
    fontSize: 28, fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT, marginBottom: 16,
  },
  trialPriceLine: { fontSize: 14, color: TXTSUB, fontFamily: FONTS.lato, letterSpacing: 0.4, textAlign: 'center', marginTop: 16, marginBottom: 12 },
  banner: {
    // TOP of the hero (was bottom) — real notifications slide down from the top.
    position: 'absolute', left: 14, right: 14, top: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14,
    paddingVertical: 12.5, paddingHorizontal: 12,   // 10 → 12.5, with the bigger icon = ~+25 % bar height
  },
  // The real app icon (no rose tile behind it — the artwork already is the icon).
  bannerIcon: { width: 42, height: 42, borderRadius: 11 },   // 34 → 42
  bannerApp: { fontSize: 12.5, fontWeight: '700', color: TXT, fontFamily: FONTS.lato, letterSpacing: 0.4 },
  bannerBody: { fontSize: 12, color: 'rgba(30,27,46,0.62)', fontFamily: FONTS.lato, letterSpacing: 0.4 },
  // Footer CTA.
  footer: { paddingTop: 6 },
  cta: { backgroundColor: ROSE, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  ctaText: { fontSize: 18.15, fontWeight: '700', color: '#FFFFFF', fontFamily: FONTS.latoBold, letterSpacing: 0.2 },   // 16.5 → 18.15 (+10 % per user)
  laterBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  laterText: { fontSize: 14, color: 'rgba(30,27,46,0.45)', fontFamily: FONTS.lato, letterSpacing: 0.4 },
});
