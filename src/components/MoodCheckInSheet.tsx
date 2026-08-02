import React, { useEffect, useRef, useState } from 'react';
import { useNudgeCoordinator } from '../state/NudgeCoordinatorContext';
import { NUDGE_PRIORITY } from '../state/nudgePriority';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
  ImageBackground, Keyboard, Platform, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, useSharedValue, useAnimatedStyle, withTiming, runOnJS, cancelAnimation,
} from 'react-native-reanimated';
import MoodInputCard from './mood/MoodInputCard';
import MonthCalendar from './mood/MonthCalendar';
import { type Mood } from './MoodEmoji';
import { useMoodCheckIn } from '../state/MoodCheckInContext';
import { useUILanguage } from '../state/UILanguageContext';
import { usePrayerBackgrounds } from '../state/PrayerBackgroundsContext';
import { getMoodVerse } from '../constants/moodContent';
import { monthStats } from '../state/moodStats';
import { localeFor } from '../i18n/locale';
import { useT } from '../i18n/useT';
import { ROSE, BTN_RADIUS, TXT, FONTS } from '../constants/theme';

const SCREEN_H = Dimensions.get('window').height;
const TOP_GAP = 50;   // sheets rise to ~full height, leaving 50px at the top
// Slow, curved rise (per user): 0.6 s on a long-tail deceleration — quick to
// commit, then a soft landing, so the sheet reads as gliding into place.
const ENTER_MS = 600;
const RISE_EASE = Easing.bezier(0.22, 1, 0.36, 1);

type Step = 'input' | 'verse' | 'done';

// Global daily mood bottom-sheet. Mounted once at the app root; renders only
// when the context's promptVisible flag is set (self-triggered once/day) AND
// the nudge coordinator has granted it the single on-screen slot.
export default function MoodCheckInSheet() {
  const { promptVisible } = useMoodCheckIn();
  const coord = useNudgeCoordinator();
  useEffect(() => {
    if (promptVisible) {
      // Daily ritual → ignoresBudget (shows alongside a reward/nudge, but still
      // strictly one overlay at a time).
      coord.requestSlot({ id: 'moodCheckIn', priority: NUDGE_PRIORITY.moodCheckIn, canShow: () => true, ignoresBudget: true });
    } else {
      coord.releaseSlot('moodCheckIn');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptVisible]);
  if (!promptVisible || !coord.isActive('moodCheckIn')) return null;
  return <Sheet />;
}

function Sheet() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { lang } = useUILanguage();
  const { closePrompt, recordPick, picks } = useMoodCheckIn();

  const [step, setStep] = useState<Step>('input');
  const [saved, setSaved] = useState<Mood | null>(null);
  const { height: winH } = useWindowDimensions();

  // Keyboard avoidance: an absolute-fill bottom sheet can't rely on
  // KeyboardAvoidingView on Android, so track the keyboard height directly and
  // pad the scroll content by it, then scroll the focused note into view.
  const scrollRef = useRef<ScrollView>(null);
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => {
      setKb(e.endCoordinates?.height ?? 0);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    const h = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  // Entrance via shared values (matches the app's sheet idiom). 420 → 600 ms
  // per user, on a long-tail deceleration curve so it reads as ONE slow,
  // deliberate rise rather than a snap. The backdrop fades across most of that
  // span instead of beating the sheet to the screen.
  const backdropO = useSharedValue(0);
  const sheetTY = useSharedValue(SCREEN_H);
  useEffect(() => {
    backdropO.value = withTiming(1, { duration: 440, easing: Easing.out(Easing.quad) });
    sheetTY.value = withTiming(0, { duration: ENTER_MS, easing: RISE_EASE });
    // Watchdog: if the rise is cancelled/dropped (saturated UI thread, dev fast
    // refresh), snap the sheet into place. Without this the sheet could sit
    // off-screen while its backdrop dims the app — visible lock-up.
    // MUST bail once we're leaving: dismissing inside this window used to let
    // the watchdog cancel the exit and slam the sheet back to fully visible,
    // where it sat inert until the exit watchdog unmounted it.
    enterWatchdog.current = setTimeout(() => {
      if (closingRef.current) return;
      cancelAnimation(sheetTY); cancelAnimation(backdropO);
      sheetTY.value = 0; backdropO.value = 1;
    }, ENTER_MS + 400);
    return () => { if (enterWatchdog.current) clearTimeout(enterWatchdog.current); };
  }, [backdropO, sheetTY]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTY.value }] }));

  // Guarded so a double-tap can't restart the exit timing, and the overlay stops
  // intercepting touches the moment it starts leaving (it used to keep eating
  // them for the whole 260 ms slide-out).
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current); }, []);
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    if (enterWatchdog.current) { clearTimeout(enterWatchdog.current); enterWatchdog.current = null; }
    backdropO.value = withTiming(0, { duration: 200 });
    sheetTY.value = withTiming(SCREEN_H, { duration: 260, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(closePrompt)();
    });
    // Watchdog: a dropped runOnJS would leave this mounted forever (promptVisible
    // stuck true). closePrompt is idempotent, so firing twice is harmless.
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(closePrompt, 700);
  };

  const onSave = (mood: Mood, note: string) => {
    Keyboard.dismiss();
    recordPick(mood, note);
    setSaved(mood);
    setStep('verse');
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(localeFor(lang), { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    // The ROOT is box-none, always: it spans the whole screen (including the
    // top), so if it ever captured touches while the sheet was invisible —
    // entrance animation dropped, exit callback lost — the user would see the
    // home screen and be unable to tap ANYTHING. Only the backdrop (a
    // deliberate dismiss target) and the sheet itself capture, and both go
    // inert while leaving.
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}
        pointerEvents={closing ? 'none' : 'auto'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { height: winH - TOP_GAP }, sheetAnim]}>
        <View style={styles.handle} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingBottom: kb > 0 ? kb + 16 : insets.bottom + 24,
            // Fill the tall sheet + center the content so a short step (input /
            // verse) has no bottom-only gap. When the keyboard is up the content
            // outgrows the viewport → this is ignored and it scrolls to the end.
            flexGrow: 1,
            justifyContent: 'center',
          }}
        >
          {step === 'input' && (
            <Animated.View key="input" entering={FadeIn.duration(220)}>
              <MoodInputCard
                dateLabel={dateLabel}
                title={t('moodCheckIn.input.title')}
                saveLabel={t('moodCheckIn.input.save')}
                onSave={onSave}
                onClose={dismiss}
              />
            </Animated.View>
          )}

          {step === 'verse' && saved && (
            <Animated.View key="verse" entering={FadeIn.duration(320)}>
              <VerseStep mood={saved} onContinue={() => setStep('done')} />
            </Animated.View>
          )}

          {step === 'done' && (
            <Animated.View key="done" entering={FadeIn.duration(320)}>
              <DoneStep picks={picks} onDone={dismiss} />
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Verse step (waits for the user to tap Continue) ────────────────────────
function VerseStep({ mood, onContinue }: { mood: Mood; onContinue: () => void }) {
  const t = useT();
  const { lang } = useUILanguage();
  const v = getMoodVerse(mood, lang);
  const prayerBg = usePrayerBackgrounds();
  const hr = new Date().getHours();
  const slot: 'morning' | 'evening' = hr >= 5 && hr < 18 ? 'morning' : 'evening';
  const bgSource = prayerBg.imageFor(slot);
  const today = new Date();
  const dateStr = today.toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={{ paddingTop: 12 }}>
      <Text style={styles.verseTitle}>
        {t('mood.verseHeading', { mood: t(`mood.label.${mood}`).toLowerCase() })}
      </Text>
      <View style={styles.verseCardWrap}>
        <ImageBackground source={bgSource} style={styles.verseCard} imageStyle={styles.verseCardImg} resizeMode="cover">
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View>
            <Text style={styles.verseDate}>{dateStr}</Text>
            <Text style={styles.verseRef}>{v.ref}</Text>
            <Text style={styles.verseText}>{v.text}</Text>
          </View>
        </ImageBackground>
      </View>
      <TouchableOpacity style={styles.doneBtn} activeOpacity={0.9} onPress={onContinue}>
        <Text style={styles.doneBtnText}>{t('common.continue')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Month completion ──────────────────────────────────────────────────────
function DoneStep({ picks, onDone }: { picks: Record<string, Mood>; onDone: () => void }) {
  const t = useT();
  const now = new Date();
  const { count } = monthStats(picks, now.getFullYear(), now.getMonth());
  const entriesForCal = React.useMemo(() => {
    const m: Record<string, { mood: Mood; at: number }> = {};
    for (const [k, mood] of Object.entries(picks)) m[k] = { mood, at: 0 };
    return m;
  }, [picks]);
  return (
    <View style={{ paddingTop: 14 }}>
      <Text style={styles.doneTitle}>{t('moodCheckIn.done.title', { count })}</Text>
      <View style={{ marginTop: 18 }}>
        <MonthCalendar cursor={now} entries={entriesForCal} today={now} />
      </View>
      <TouchableOpacity style={styles.doneBtn} activeOpacity={0.9} onPress={onDone}>
        <Text style={styles.doneBtnText}>{t('moodCheckIn.done.cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 210, elevation: 210 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(30,27,46,0.16)', alignSelf: 'center', marginBottom: 6 },

  verseTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 22, lineHeight: 30, textAlign: 'center', marginTop: 14, marginBottom: 26,
  },
  verseCardWrap: { marginBottom: 8 },
  verseCard: { borderRadius: 20, overflow: 'hidden', paddingTop: 56, paddingBottom: 72, paddingHorizontal: 24, backgroundColor: '#2D0A1A' },   // 14 → 18.2 (+30 % card radius per user)
  verseCardImg: { borderRadius: 20 },
  verseDate: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
  verseRef: { fontSize: 18.3, fontWeight: '700', color: '#fff', letterSpacing: 0.3, marginBottom: 22 },
  verseText: { fontFamily: FONTS.merriweather, fontSize: 17.5, lineHeight: 27, color: 'rgba(255,255,255,0.96)' },

  doneTitle: {
    fontFamily: FONTS.loraBold, fontWeight: '600', color: TXT,
    fontSize: 24, lineHeight: 32, textAlign: 'center',
  },
  doneBtn: { marginTop: 26, backgroundColor: ROSE, height: 52, borderRadius: BTN_RADIUS, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
});
