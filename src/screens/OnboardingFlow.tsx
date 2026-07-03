import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ROSE, LAV, TXT, TXTSUB, BG, FONTS } from '../constants/theme';
import { useT } from '../i18n/useT';
import { useOnboarding, type OnboardingAnswers } from '../state/OnboardingContext';
import { useNotifications } from '../state/NotificationsContext';
import { useUILanguage } from '../state/UILanguageContext';
import { logEvent, setUserProps } from '../services/firebase';
import TimePickerSheet from '../components/TimePickerSheet';
import SignInSheet from '../components/SignInSheet';

// New-user questionnaire (first launch only — gated in RootNavigator). Seven
// questions + one encouragement interstitial, in the Her Bible white/pink
// theme. Single-select questions auto-advance on tap; topics is multi-select;
// the final screen is the notification soft pre-prompt → OS permission.
// Answers persist via OnboardingContext and tailor later content.

const TOTAL = 9;

// Analytics step names (snake_case, index-aligned). Mirrors the funnel order so
// `onboarding_step_view.step_name` is stable for BigQuery.
const STEP_NAMES = ['goal', 'age', 'bible', 'encourage', 'topics', 'time', 'remind', 'notify', 'login'] as const;

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
  { k: 'familiar', sub: false },
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
  const { lang } = useUILanguage();

  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>({ topics: [] });
  const [editing, setEditing] = useState<'morning' | 'night' | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const notifsOnRef = useRef(false);   // set at the notify step; read by finishAll

  // Analytics. `onboarding_start` once; `onboarding_step_view` on every step
  // (incl. step 0 on mount) → powers the per-screen funnel / drop-off in
  // Firebase + BigQuery.
  useEffect(() => { logEvent('onboarding_start', { app_language: lang }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logEvent('onboarding_step_view', { step_index: step, step_name: STEP_NAMES[step] }); }, [step]);
  // The final login screen is itself a login prompt — log it + record the source
  // so a sign-in here is attributed to onboarding in AuthContext's sign_up event.
  useEffect(() => {
    if (step === 8) {
      AsyncStorage.setItem('loginPrompt:lastTrigger', 'onboarding').catch(() => {});
      logEvent('login_prompt_shown', { trigger: 'onboarding' });
    }
  }, [step]);

  const goNext = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  // Single-select: store + log the answer + auto-advance after a brief highlight.
  const pickSingle = (field: keyof OnboardingAnswers, value: string | number) => {
    setA((prev) => ({ ...prev, [field]: value }));
    logEvent('onboarding_answer', { step_name: STEP_NAMES[step], question: String(field), value: String(value) });
    setTimeout(goNext, 200);
  };
  const toggleTopic = (k: string) => {
    setA((prev) => {
      const cur = prev.topics ?? [];
      return { ...prev, topics: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
    });
  };

  // Continue button (steps that aren't single-select auto-advance): log the
  // multi-select answers as the user moves forward, then advance.
  const continueFrom = () => {
    if (step === 4) {
      const topics = a.topics ?? [];
      logEvent('onboarding_answer', { step_name: 'topics', value: topics.join(','), value_count: topics.length });
    } else if (step === 6) {
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
      {/* Top bar: back (hidden on first step) + Skip-everything. */}
      <View style={styles.topBar}>
        {step > 0 ? (
          <TouchableOpacity onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={TXTSUB} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <TouchableOpacity onPress={() => finishAll('skipped')} hitSlop={12}>
          <Text style={styles.skip}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress. */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL) * 100}%` }]} />
      </View>

      <Animated.View key={step} entering={FadeInDown.duration(300)} style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {step === 0 && (
            <>
              <Text style={styles.h}>{t('onboarding.goal.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.goal.sub')}</Text>
              {GOAL_OPTS.map((o) => {
                const sel = a.goal === o.k;
                return (
                  <TouchableOpacity key={o.k} activeOpacity={0.85} onPress={() => pickSingle('goal', o.k)} style={[styles.row, sel && styles.rowSel]}>
                    <Ionicons name={o.icon as any} size={21} color={accent} />
                    <Text style={[styles.rowText, sel && styles.rowTextSel]}>{t(`onboarding.goal.opt.${o.k}`)}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.h}>{t('onboarding.age.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.age.sub')}</Text>
              {AGE_OPTS.map((o) => {
                const sel = a.age === o;
                return (
                  <TouchableOpacity key={o} activeOpacity={0.85} onPress={() => pickSingle('age', o)} style={[styles.row, sel && styles.rowSel]}>
                    <Text style={[styles.rowText, sel && styles.rowTextSel, { flex: 1 }]}>{o}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.h}>{t('onboarding.bible.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.bible.sub')}</Text>
              {BIBLE_OPTS.map((o) => {
                const sel = a.bibleLevel === o.k;
                return (
                  <TouchableOpacity key={o.k} activeOpacity={0.85} onPress={() => pickSingle('bibleLevel', o.k)} style={[styles.card, sel && styles.rowSel]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, sel && styles.rowTextSel]}>{t(`onboarding.bible.opt.${o.k}`)}</Text>
                      {o.sub && <Text style={styles.cardSub}>{t(`onboarding.bible.opt.${o.k}.sub`)}</Text>}
                    </View>
                    {sel && <Ionicons name="checkmark" size={18} color={accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 3 && (
            <View style={styles.center}>
              <LinearGradient colors={['#F9D9E6', '#F4A6C0', ROSE]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
                <Ionicons name="book-outline" size={58} color="#FFFFFF" style={{ opacity: 0.92 }} />
              </LinearGradient>
              <Text style={[styles.h, { textAlign: 'center', marginTop: 22 }]}>{t('onboarding.encourage.title')}</Text>
              <Text style={[styles.sub, { textAlign: 'center', paddingHorizontal: 16 }]}>{t('onboarding.encourage.sub')}</Text>
            </View>
          )}

          {step === 4 && (
            <>
              <Text style={styles.h}>{t('onboarding.topics.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.topics.sub')}</Text>
              <View style={styles.chips}>
                {TOPIC_OPTS.map((k) => {
                  const sel = (a.topics ?? []).includes(k);
                  return (
                    <TouchableOpacity key={k} activeOpacity={0.85} onPress={() => toggleTopic(k)} style={[styles.chip, sel && styles.chipSel]}>
                      <Text style={[styles.chipText, sel && styles.chipTextSel]}>{t(`onboarding.topics.opt.${k}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.h}>{t('onboarding.time.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.time.sub')}</Text>
              {TIME_OPTS.map((min) => {
                const sel = a.timeCommitment === min;
                return (
                  <TouchableOpacity key={min} activeOpacity={0.85} onPress={() => pickSingle('timeCommitment', min)} style={[styles.card, sel && styles.rowSel]}>
                    <Text style={styles.timeNum}>{min} {t('onboarding.time.min')}</Text>
                    <Text style={[styles.timeSub, sel && { color: TXT }]}>{t(`onboarding.time.opt.${min}`)}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={accent} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {step === 6 && (
            <>
              <Text style={styles.h}>{t('onboarding.remind.title')}</Text>
              <Text style={styles.sub}>{t('onboarding.remind.sub')}</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setEditing('morning')} style={styles.timeRow}>
                <View style={styles.timeLabel}>
                  <Ionicons name="sunny-outline" size={21} color={ROSE} />
                  <Text style={styles.timeLabelText}>{t('onboarding.remind.morning')}</Text>
                </View>
                <Text style={[styles.timePill, { backgroundColor: '#FBEAF0', color: ROSE }]}>{to12h(settings.morning.hour, settings.morning.minute)}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setEditing('night')} style={styles.timeRow}>
                <View style={styles.timeLabel}>
                  <Ionicons name="moon-outline" size={20} color={LAV} />
                  <Text style={styles.timeLabelText}>{t('onboarding.remind.evening')}</Text>
                </View>
                <Text style={[styles.timePill, { backgroundColor: '#EEE9F8', color: LAV }]}>{to12h(settings.night.hour, settings.night.minute)}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 7 && (
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

          {step === 8 && (
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
        {step === 7 ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <TouchableOpacity activeOpacity={0.9} onPress={onNotifyRemind} style={styles.cta}>
              <Text style={styles.ctaText}>{t('onboarding.notify.cta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} hitSlop={10} style={styles.laterBtn}>
              <Text style={styles.laterText}>{t('onboarding.notify.later')}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : step === 8 ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setShowSignIn(true)} style={styles.cta}>
              <Text style={styles.ctaText}>{t('onboarding.login.cta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => finishAll('completed')} hitSlop={10} style={styles.laterBtn}>
              <Text style={styles.laterText}>{t('onboarding.notify.later')}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (step === 3 || step === 4 || step === 6) ? (
          <TouchableOpacity activeOpacity={0.9} onPress={continueFrom} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.continue')}</Text>
          </TouchableOpacity>
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
  skip: { fontSize: 14, fontWeight: '600', color: ROSE, fontFamily: FONTS.lato },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(230,63,105,0.16)', marginTop: 8, marginBottom: 18 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: ROSE },
  content: { flex: 1 },
  scroll: { paddingBottom: 12 },
  center: { alignItems: 'center' },
  h: {
    fontSize: 24, color: TXT, fontFamily: FONTS.loraBold, fontWeight: '600',
    lineHeight: 31, letterSpacing: -0.2, marginBottom: 7,
  },
  sub: { fontSize: 13.5, color: TXTSUB, fontFamily: FONTS.lato, lineHeight: 20, marginBottom: 16 },
  // Single-line option row.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 14, paddingHorizontal: 14, marginBottom: 9,
  },
  rowSel: { backgroundColor: '#FBEAF0', borderWidth: 1.5, borderColor: ROSE },
  rowText: { flex: 1, fontSize: 15, color: TXT, fontFamily: FONTS.lato },
  rowTextSel: { fontWeight: '700' },
  // Two-line card (bible level / time commitment).
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 13, paddingHorizontal: 14, marginBottom: 9,
  },
  cardTitle: { fontSize: 15, color: TXT, fontFamily: FONTS.lato },
  cardSub: { fontSize: 12.5, color: 'rgba(30,27,46,0.42)', fontFamily: FONTS.lato, marginTop: 2 },
  timeNum: { fontSize: 18, color: ROSE, fontFamily: FONTS.loraBold, fontWeight: '600', width: 64 },
  timeSub: { flex: 1, fontSize: 13, color: 'rgba(30,27,46,0.55)', fontFamily: FONTS.lato },
  // Chips (topics, multi-select).
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.12)',
    borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16,
  },
  chipSel: { backgroundColor: ROSE, borderColor: ROSE },
  chipText: { fontSize: 14, color: TXT, fontFamily: FONTS.lato },
  chipTextSel: { color: '#FFFFFF', fontWeight: '700' },
  // Encouragement interstitial.
  hero: { width: '100%', height: 200, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  // Time-picker rows (reminder step).
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(30,27,46,0.08)',
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 11,
  },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeLabelText: { fontSize: 15, color: TXT, fontFamily: FONTS.lato },
  timePill: { fontSize: 15, fontWeight: '700', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  // Notification hero + mock banner.
  notifHero: { width: '100%', height: 188, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4, overflow: 'hidden' },
  loginHero: { width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  loginBenefits: { alignSelf: 'stretch', marginTop: 22, gap: 14, paddingHorizontal: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  benefitIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FBEAF0', alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 14.5, color: TXT, fontFamily: FONTS.lato, lineHeight: 20 },
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
